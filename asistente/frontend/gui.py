import ctypes
import json
import math
import os
import queue
import subprocess
import sys
import threading
import time
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Any


PROJECT_ROOT = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.runtime import AssistantRuntime
from backend.recognition_languages import installed_languages
from backend.hotkeys import GlobalHotkeys, DEFAULT_HOTKEYS, HOTKEY_LABELS
from backend.ai import AIClient
from backend.chat_history import CHAT_HISTORY_PATH, load_chat_messages
from backend.commands import COMMAND_EXAMPLES
from backend.config import DEFAULT_CONFIG, load_config, save_config, normalize_voice_speed
from backend.startup import configure_startup
from backend.voice import list_available_voices
from backend.voice_install import install_windows_voices
from frontend.activation import require_activation
from frontend.branding import set_window_icon
from frontend.update_ui import UpdateControls
from frontend.controls import BlueSlider, MicrophoneSignal
from frontend.music_notice import MusicNotice
from frontend.shortcut_capture import ShortcutCapture
from frontend.overlay_window import NoActivateWindow
from frontend.section_button import SectionButton


THEMES = {
    "light": {
        "background": "#f5f5f3",
        "sidebar": "#f5f5f3",
        "surface": "#ffffff",
        "surface_light": "#eaeae7",
        "border": "#d6d6d1",
        "text": "#191917",
        "muted": "#70706b",
        "purple": "#333330",
        "cyan": "#333330",
        "green": "#333330",
        "amber": "#333330",
        "red": "#333330",
    },
    "dark": {
        "background": "#333333",
        "sidebar": "#333333",
        "surface": "#3D3D3D",
        "surface_light": "#484848",
        "border": "#626262",
        "text": "#F3F3F3",
        "muted": "#CCCCCC",
        "purple": "#E0E0E0",
        "cyan": "#83CDFF",
        "green": "#A8D7BC",
        "amber": "#E6C78B",
        "red": "#FFACAC",
    },
}

COLORS = THEMES["light"].copy()

def _build_geodesic_sphere(
    subdivisions: int = 2,
) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    golden_ratio = (1 + math.sqrt(5)) / 2
    vertices = [
        (-1, golden_ratio, 0),
        (1, golden_ratio, 0),
        (-1, -golden_ratio, 0),
        (1, -golden_ratio, 0),
        (0, -1, golden_ratio),
        (0, 1, golden_ratio),
        (0, -1, -golden_ratio),
        (0, 1, -golden_ratio),
        (golden_ratio, 0, -1),
        (golden_ratio, 0, 1),
        (-golden_ratio, 0, -1),
        (-golden_ratio, 0, 1),
    ]

    def normalize(vertex: tuple[float, float, float]) -> tuple[float, float, float]:
        length = math.sqrt(sum(component * component for component in vertex))
        return tuple(component / length for component in vertex)

    vertices = [normalize(vertex) for vertex in vertices]
    faces = [
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    ]

    for _ in range(subdivisions):
        midpoint_indices: dict[tuple[int, int], int] = {}

        def midpoint(first: int, second: int) -> int:
            edge = (min(first, second), max(first, second))
            if edge not in midpoint_indices:
                midpoint_indices[edge] = len(vertices)
                vertices.append(
                    normalize(
                        tuple(
                            (vertices[first][axis] + vertices[second][axis]) / 2
                            for axis in range(3)
                        )
                    )
                )
            return midpoint_indices[edge]

        refined_faces = []
        for first, second, third in faces:
            first_second = midpoint(first, second)
            second_third = midpoint(second, third)
            third_first = midpoint(third, first)
            refined_faces.extend(
                (
                    (first, first_second, third_first),
                    (second, second_third, first_second),
                    (third, third_first, second_third),
                    (first_second, second_third, third_first),
                )
            )
        faces = refined_faces

    return vertices, faces


GEODESIC_VERTICES, GEODESIC_FACES = _build_geodesic_sphere()


def _build_polygon_sphere():
    """Dense dual mesh: 150 hexagons and 12 small pentagonal junctions."""
    vertices, triangles = _build_geodesic_sphere(2)
    centers = []
    adjacent = [[] for _ in vertices]
    for index, face in enumerate(triangles):
        center = tuple(sum(vertices[v][axis] for v in face) / 3 for axis in range(3))
        length = math.sqrt(sum(c * c for c in center))
        centers.append(tuple(c / length for c in center))
        for vertex in face:
            adjacent[vertex].append(index)
    faces = []
    for normal, incident in zip(vertices, adjacent):
        reference = (0, 1, 0) if abs(normal[1]) < 0.9 else (1, 0, 0)
        tangent = (normal[1] * reference[2] - normal[2] * reference[1],
                   normal[2] * reference[0] - normal[0] * reference[2],
                   normal[0] * reference[1] - normal[1] * reference[0])
        length = math.sqrt(sum(c * c for c in tangent))
        tangent = tuple(c / length for c in tangent)
        bitangent = (normal[1] * tangent[2] - normal[2] * tangent[1],
                     normal[2] * tangent[0] - normal[0] * tangent[2],
                     normal[0] * tangent[1] - normal[1] * tangent[0])
        def angle(index):
            point = centers[index]
            return math.atan2(sum(a * b for a, b in zip(point, bitangent)),
                              sum(a * b for a, b in zip(point, tangent)))
        faces.append(tuple(sorted(incident, key=angle)))
    return centers, faces


ORB_VERTICES, ORB_FACES = _build_polygon_sphere()


STATES = {
    "IDLE": ("LISTO PARA AYUDARTE", COLORS["purple"]),
    "LISTENING": ("ESCUCHANDO", COLORS["green"]),
    "CALIBRATING_MICROPHONE": ("CALIBRANDO MICRÓFONO", COLORS["amber"]),
    "MICROPHONE_READY": ("MICRÓFONO LISTO", COLORS["green"]),
    "MICROPHONE_ERROR": ("ERROR DEL MICRÓFONO", COLORS["red"]),
    "PROCESSING": ("PENSANDO", COLORS["amber"]),
    "SPEAKING": ("HABLANDO", COLORS["red"]),
    "SPEAKING_START": ("HABLANDO", COLORS["red"]),
    "SPEAKING_END": ("LISTO PARA AYUDARTE", COLORS["purple"]),
    "MICROPHONE_OFF": ("MICRÓFONO APAGADO", COLORS["muted"]),
}


class AssistantWindow:
    def __init__(self) -> None:
        config = load_config()
        self.show_chat_history = config.get("show_chat_history", True) is not False
        self.theme_name = config.get("ui_theme", "light")
        if self.theme_name not in THEMES:
            self.theme_name = "light"
        self.settings_colors = THEMES[self.theme_name].copy()
        COLORS.update(self.settings_colors)
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("Leytech Asistente")
        set_window_icon(self.root, self.theme_name)
        self.root.geometry("400x450" if self.show_chat_history else "400x400")
        self.root.resizable(False, False)
        self.root.configure(bg=COLORS["background"])
        self.root.attributes("-topmost", True)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.root.bind("<Map>", self._on_titlebar_map, add="+")
        self.root.bind("<Unmap>", self._on_window_unmap, add="+")
        self._overlay_noactivate = False
        self._normal_window_geometry = "400x450+100+100" if self.show_chat_history else "400x400+100+100"
        self._normal_window_rect = None
        self.root.bind("<Configure>", self._remember_window_geometry, add="+")
        self._orb_after_id = None
        self._restore_visual_after_id = None

        self.events: queue.Queue[tuple[str, Any]] = queue.Queue()
        self.runtime = AssistantRuntime(self._receive_event)
        self.assistant_ready = False
        self._shutdown_pending = False
        self.microphone_enabled = bool(config.get("microphone_enabled", True))
        self.current_state = "IDLE"
        self.animation_started = time.monotonic()
        self.settings_window: tk.Toplevel | None = None
        self.settings_api_status: tk.Label | None = None
        self.settings_save_button: tk.Button | None = None
        self.current_api_test_button: tk.Button | None = None
        self.microphone_combo: ttk.Combobox | None = None
        self.microphone_status: tk.Label | None = None
        self.microphone_level_label = None
        self._microphone_signal = MicrophoneSignal()
        self.microphone_calibration_status: tk.Label | None = None
        self.microphone_calibrate_button: tk.Button | None = None
        self.microphone_threshold_variable: tk.IntVar | None = None
        self._voice_calibration_status_state = ""
        self._voice_calibration_status_message = ""
        self.microphone_options: dict[str, int | None] = {}
        self.chat_message_rows: list[dict[str, str]] = []
        self._chat_following = True
        self._chat_pending_message = None
        self._chat_layout_after_id: str | None = None
        self._memory_render_id: str | None = None
        self._poll_after_id: str | None = None
        self._close_after_id: str | None = None
        self.close_after_speech = False
        self._restart_started = False
        self._restart_after_id: str | None = None
        self.update_installer: Path | None = None
        self.closing = False
        self.closed = False
        self.updates = UpdateControls(self.root, self._install_update)

        self.hotkeys = GlobalHotkeys(config.get("hotkeys", {}))
        self.music_notice = MusicNotice(self.root, self.settings_colors, self._music_notice_icon)
        self._configure_styles()
        self._build_layout()
        self.root.after_idle(lambda: self._reveal_window(self.root))
        self._load_chat_history()
        self._set_state("IDLE")
        self._poll_after_id = self.root.after(80, self._poll_events)
        self.runtime.start()

    def _reveal_window(self, window):
        if not window.winfo_exists():
            return
        window.update_idletasks()
        self._apply_titlebar_theme(window)
        if window is not self.root and self._overlay_noactivate and sys.platform == "win32":
            guard = getattr(window, '_noactivate_guard', None)
            if guard is None:
                guard = window._noactivate_guard = NoActivateWindow(window)
            guard.set_enabled(True)
            window.attributes("-topmost", True)
            from ctypes import wintypes
            show = ctypes.windll.user32.ShowWindow
            show.argtypes = [wintypes.HWND, ctypes.c_int]
            show(guard.hwnd, 4)
        else:
            window.deiconify()
            if window is not self.root:
                window.update_idletasks()
                window.grab_set()

    def _on_window_unmap(self, event):
        if event.widget is not self.root:
            return
        for name in ("_orb_after_id", "_restore_visual_after_id", "_chat_layout_after_id"):
            job = getattr(self, name, None)
            if job is not None:
                self.root.after_cancel(job)
                setattr(self, name, None)

    def _on_titlebar_map(self, event):
        if event.widget is self.root and not self.closed:
            self.music_notice.dismiss()
            if self._restore_visual_after_id is None:
                self._restore_visual_after_id = self.root.after(0, self._resume_visuals)

    def _resume_visuals(self):
        if self._restore_visual_after_id is not None:
            self.root.after_cancel(self._restore_visual_after_id)
        self._restore_visual_after_id = None
        if self.closed or not self.root.winfo_viewable():
            return
        self._apply_titlebar_theme(self.root)
        self._orb_last_frame = time.monotonic()
        if self._orb_after_id is None:
            self._animate_orb()
        self.root.update_idletasks()
        self._scroll_chat_to_bottom()
        self.chat_canvas.update_idletasks()
        if sys.platform == "win32":
            from ctypes import wintypes
            redraw = ctypes.windll.user32.RedrawWindow
            redraw.argtypes = [wintypes.HWND, ctypes.c_void_p, wintypes.HRGN, wintypes.UINT]
            redraw(self._window_handle(), None, None, 0x181)

    def _window_handle(self):
        from ctypes import wintypes
        user = ctypes.windll.user32
        user.GetParent.argtypes = [wintypes.HWND]
        user.GetParent.restype = wintypes.HWND
        return user.GetParent(self.root.winfo_id()) or self.root.winfo_id()

    def _set_overlay_noactivate(self, enabled):
        guard = getattr(self.root, '_noactivate_guard', None)
        if guard is None and enabled:
            guard = self.root._noactivate_guard = NoActivateWindow(self.root, taskbar=True)
        if guard is not None:
            guard.set_enabled(enabled)
        self._overlay_noactivate = enabled

    def _activate_text_input(self, event=None):
        if self._overlay_noactivate:
            self._set_overlay_noactivate(False)
            if sys.platform == "win32":
                from ctypes import wintypes
                activate = ctypes.windll.user32.SetForegroundWindow
                activate.argtypes = [wintypes.HWND]
                activate(self._window_handle())
            self.message_entry.focus_force()

    def _focus_control(self, widget):
        if not self._overlay_noactivate:
            widget.focus_set()

    def _remember_window_geometry(self, event=None):
        if event is not None and event.widget is not self.root:
            return
        if self.root.state() != "normal" or not self.root.winfo_viewable():
            return
        if self.root.winfo_width() < 300 or self.root.winfo_height() < 300:
            return
        self._normal_window_geometry = self.root.geometry()
        if sys.platform == "win32":
            from ctypes import wintypes
            rect = wintypes.RECT()
            user = ctypes.windll.user32
            user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
            if user.GetWindowRect(self._window_handle(), ctypes.byref(rect)) and rect.right - rect.left >= 300 and rect.bottom - rect.top >= 300:
                self._normal_window_rect = (rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)

    def _show_without_activation(self):
        # Conservar la ventana en la barra de tareas durante la restauración.
        self.root.geometry(self._normal_window_geometry)
        self.root.update_idletasks()
        self._set_overlay_noactivate(True)
        self._apply_titlebar_theme(self.root)
        if sys.platform == "win32":
            from ctypes import wintypes
            user = ctypes.windll.user32
            hwnd = self._window_handle()
            class Placement(ctypes.Structure):
                _fields_ = [("length", wintypes.UINT), ("flags", wintypes.UINT),
                            ("showCmd", wintypes.UINT), ("minPosition", wintypes.POINT),
                            ("maxPosition", wintypes.POINT), ("normalPosition", wintypes.RECT)]
            placement = Placement()
            placement.length = ctypes.sizeof(placement)
            user.GetWindowPlacement.argtypes = [wintypes.HWND, ctypes.POINTER(Placement)]
            user.SetWindowPlacement.argtypes = [wintypes.HWND, ctypes.POINTER(Placement)]
            if user.GetWindowPlacement(hwnd, ctypes.byref(placement)):
                placement.flags = 0
                placement.showCmd = 4
                user.SetWindowPlacement(hwnd, ctypes.byref(placement))
            user.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
            user.ShowWindow(hwnd, 4)
            user.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
            if self._normal_window_rect is not None:
                x, y, width, height = self._normal_window_rect
            else:
                x, y = self.root.winfo_x(), self.root.winfo_y()
                width = max(400, self.root.winfo_reqwidth()) + 16
                height = max(400, self.root.winfo_reqheight()) + 40
            user.SetWindowPos(hwnd, -1, x, y, width, height, 0x70)
        else:
            self.root.deiconify()
        self._resume_visuals()

    def _apply_titlebar_theme(self, window):
        set_window_icon(window, self.theme_name)
        is_main = window is self.root
        dark = self.theme_name == "dark"
        colors = self.settings_colors
        if sys.platform != "win32":
            return
        try:
            from ctypes import wintypes
            user32 = ctypes.windll.user32
            user32.GetParent.argtypes = [wintypes.HWND]
            user32.GetParent.restype = wintypes.HWND
            hwnd = user32.GetParent(window.winfo_id())
            theme_key = (hwnd, dark, colors["background"], colors["text"])
            if getattr(window, "_caption_theme_key", None) == theme_key:
                return
            setter = ctypes.windll.dwmapi.DwmSetWindowAttribute
            setter.argtypes = [wintypes.HWND, ctypes.c_uint, ctypes.c_void_p, ctypes.c_uint]
            setter.restype = ctypes.c_long
            # Colores de la barra de título.
            mode = ctypes.c_int(dark)
            setter(hwnd, 20, ctypes.byref(mode), ctypes.sizeof(mode))
            for attribute, color in ((35, colors["background"]), (36, colors["text"]), (34, colors["background"])):
                red, green, blue = (int(color[i:i + 2], 16) for i in (1, 3, 5))
                value = ctypes.c_uint(red | (green << 8) | (blue << 16))
                setter(hwnd, attribute, ctypes.byref(value), ctypes.sizeof(value))
            window._caption_theme_key = theme_key
        except (OSError, AttributeError, tk.TclError):
            pass  # Older Windows versions retain their native title bar.

    def _configure_styles(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure(
            "Assistant.Vertical.TScrollbar",
            background=self.settings_colors["surface_light"],
            troughcolor=self.settings_colors["surface"],
            bordercolor=self.settings_colors["surface"],
            arrowcolor=self.settings_colors["muted"],
        )
        style.configure(
            "TCombobox",
            fieldbackground=self.settings_colors["surface"],
            background=self.settings_colors["surface_light"],
            foreground=self.settings_colors["text"],
            arrowcolor=self.settings_colors["text"],
            bordercolor=self.settings_colors["border"],
        )
        style.map(
            "TCombobox",
            fieldbackground=[("readonly", self.settings_colors["surface"])],
            foreground=[("readonly", self.settings_colors["text"])],
            selectbackground=[("readonly", self.settings_colors["surface"])],
            selectforeground=[("readonly", self.settings_colors["text"])],
        )
        style.configure(
            "Horizontal.TScale",
            background=self.settings_colors["background"],
            troughcolor=self.settings_colors["surface_light"],
        )

    def _build_layout(self) -> None:
        self.root.grid_columnconfigure(0, weight=1)
        self.root.grid_rowconfigure(1, weight=1)

        center = tk.Frame(self.root, bg=COLORS["background"])
        center.grid(row=1, column=0, sticky="nsew")
        center.grid_columnconfigure(0, weight=1)
        center.grid_rowconfigure(0, weight=1)
        orb_area = tk.Frame(center, bg=COLORS["background"])
        orb_area.grid(row=0, column=0, sticky="nsew")
        orb_area.grid_columnconfigure(0, weight=1)
        orb_area.grid_rowconfigure(0, weight=1)
        self.orb = tk.Canvas(orb_area, width=270, height=270, bg=COLORS["background"], highlightthickness=0)
        self.orb.grid(row=0, column=0, sticky="nsew")
        self.settings_button = tk.Button(
            orb_area, text="⚙", command=self._open_settings,
            font=("Segoe UI Symbol", 20), fg=COLORS["muted"],
            bg=COLORS["background"], activeforeground=COLORS["text"],
            activebackground=COLORS["surface"], relief="flat", bd=0,
            width=2, pady=2, cursor="hand2")
        self.settings_button.place(relx=1, x=-8, y=6, anchor="ne")
        self.orb.configure(cursor="hand2")
        self.orb.bind("<ButtonPress-1>", self._on_orb_press)
        self.orb.bind("<B1-Motion>", self._on_orb_drag)
        self.orb.bind("<ButtonRelease-1>", self._on_orb_release)
        self._orb_rotation_x = 0.32
        self._orb_rotation_y = 0.0
        self._orb_drag_position = None
        self._orb_last_frame = time.monotonic()
        self._orb_waves = []
        self._orb_projected = []
        self._orb_rotated = []
        self._orb_face_items = [self.orb.create_polygon(0,0,0,0,0,0,state="hidden") for _ in ORB_FACES]
        self._orb_interaction_started = 0.0
        self._orb_interaction_direction = 1.0
        player = tk.Frame(center, bg=COLORS["background"])
        player.grid(row=2, column=0, sticky="ew", padx=18, pady=(0, 6))
        player.grid_columnconfigure(0, weight=1)
        self.music_panel = player
        player.grid_remove()
        self.music_title = tk.Label(player, text="Pide una canción", font=("Segoe UI", 9, "bold"),
                                    fg=COLORS["text"], bg=COLORS["background"], wraplength=330)
        self.music_title.grid(row=0, column=0, sticky="ew")
        self._music_playing = False
        self._basic_commands_shown = False
        self._music_seeking = False
        self._music_duration = 0
        self._music_seekable = False
        self.music_position = tk.DoubleVar(value=0)
        self.music_slider = tk.Canvas(player, height=20, bg=COLORS["background"],
                                      highlightthickness=0, takefocus=True)
        self.music_slider.grid(row=1, column=0, sticky="ew", pady=(3, 0))
        self.music_slider.bind("<Configure>", lambda _event: self._draw_music_progress())
        self.music_slider.bind("<ButtonPress-1>", self._begin_music_seek)
        self.music_slider.bind("<B1-Motion>", self._drag_music_seek)
        self.music_slider.bind("<ButtonRelease-1>", self._finish_music_seek)
        self.music_slider.bind("<Left>", lambda event: self._step_music_seek(-5000))
        self.music_slider.bind("<Right>", lambda event: self._step_music_seek(5000))
        self.music_position.trace_add("write", lambda *_args: self._draw_music_progress())
        self.music_time = tk.Label(player, text="0:00 / 0:00", font=("Segoe UI", 8),
                                   fg=COLORS["muted"], bg=COLORS["background"])
        self.music_time.grid(row=2, column=0)
        controls = tk.Frame(player, bg=COLORS["background"])
        controls.grid(row=3, column=0)
        for caption, action in (("⏮", "previous"), ("▶", "toggle"), ("⏭", "next")):
            button = tk.Button(controls, text=caption, command=lambda a=action: self._send_payload(
                {"type": "music_control", "action": a}, notify=False), font=("Segoe UI Symbol", 11),
                fg=COLORS["text"], bg=COLORS["surface_light"], relief="flat", width=4, state="disabled")
            button.pack(side="left", padx=3)
            setattr(self, "music_" + action + "_button", button)


        self._build_conversation()
        self._build_composer()
        self._apply_chat_visibility()
        self._animate_orb()

    def _load_brand_parts(self):
        if getattr(self, '_brand_parts', None):
            return
        path = PROJECT_ROOT / 'frontend' / 'assets' / 'leytech-original.png'
        original = tk.PhotoImage(master=self.root, file=str(path))
        width, height = original.width(), original.height()
        self._brand_parts = []
        for left, top, right, bottom in (
            (0.370, 0.268, 0.630, 0.498),
            (0.170, 0.555, 0.830, 0.640),
        ):
            part = tk.PhotoImage(master=self.root)
            self.root.tk.call(
                str(part), "copy", str(original), "-from",
                round(width * left), round(height * top),
                round(width * right), round(height * bottom),
            )
            self._brand_parts.append(part)

    def _build_brand_header(self, header: tk.Frame) -> None:
        # Mostrar el símbolo y el nombre uno al lado del otro.
        self.brand_canvas = tk.Canvas(
            header, width=190, height=36, bg=header.cget("bg"), highlightthickness=0,
        )
        self.brand_canvas.grid(row=0, column=0, sticky="ew")
        path = PROJECT_ROOT / "frontend" / "assets" / "leytech-original.png"
        try:
            self._load_brand_parts()
        except (tk.TclError, OSError):
            # Usar texto si falta el logo.
            self.brand_canvas.configure(bg=header.cget("bg"))
            self.brand_canvas.create_text(
                5, 18, text="LEYTECH", anchor="w",
                fill=COLORS["text"], font=("Segoe UI", 17, "bold"),
            )
            return
        self._brand_size = None
        self._brand_images = []
        self.brand_canvas.bind("<Configure>", self._resize_brand_header)

    def _resize_brand_header(self, event: tk.Event) -> None:
        available = max(1, min(230, event.width))
        if available == self._brand_size:
            return
        self._brand_size = available
        symbol, wordmark = self._brand_parts
        symbol_height = max(8, min(32, available * 0.18))
        symbol_scale = max(1, math.ceil(symbol.height() / symbol_height))
        icon = symbol.subsample(symbol_scale, symbol_scale)
        text_width = max(1, available - icon.width() - 20)
        text_scale = max(
            1, math.ceil(wordmark.width() / text_width),
            math.ceil(wordmark.height() / 22),
        )
        name = wordmark.subsample(text_scale, text_scale)
        background = self.brand_canvas.cget("bg")
        icon = self._theme_brand_image(icon, background)
        name = self._theme_brand_image(name, background)
        self._brand_images = [icon, name]  # Tk requires live image references.
        self.brand_canvas.delete("all")
        self.brand_canvas.create_image(4, 18, image=icon, anchor="w")
        self.brand_canvas.create_image(12 + icon.width(), 18, image=name, anchor="w")

    def _theme_brand_image(self, source: tk.PhotoImage, background_color: str | None = None) -> tk.PhotoImage:
        # Adaptar el fondo del logo al tema.
        background = tuple(int((background_color or COLORS["background"])[i:i + 2], 16) for i in (1, 3, 5))
        foreground = tuple(int(self.settings_colors["text"][i:i+2],16) for i in (1,3,5))
        image = tk.PhotoImage(master=self.root, width=source.width(), height=source.height())
        rows = []
        for y in range(source.height()):
            row = []
            for x in range(source.width()):
                pixel = source.get(x, y)
                minimum, maximum = min(pixel), max(pixel)
                if minimum >= 235:
                    color = background
                elif maximum - minimum <= 24:
                    opacity = 1 - sum(pixel) / (3 * 255)
                    color = tuple(round(bg + opacity * (fg - bg)) for bg, fg in zip(background, foreground))
                else:
                    # Conservar el azul del logo.
                    matte = minimum / 255
                    color = tuple(max(0, min(255, round(c - minimum + matte * bg))) for c, bg in zip(pixel, background))
                row.append("#%02x%02x%02x" % color)
            rows.append("{" + " ".join(row) + "}")
        image.put(" ".join(rows))
        return image

    def _build_conversation(self) -> None:
        section = self.conversation_section = tk.Frame(self.root, bg=COLORS["background"])
        section.grid(row=2, column=0, sticky="ew", padx=18, pady=(4, 10))
        section.grid_columnconfigure(0, weight=1)
        card = self.chat_card = tk.Frame(section, bg=COLORS["surface"], height=92,
                                         highlightbackground=COLORS["border"], highlightthickness=1)
        card.pack(fill="x")
        card.grid_propagate(False)
        card.grid_columnconfigure(0, weight=1)
        card.grid_rowconfigure(0, weight=1)
        self.chat_text = tk.Text(card, wrap="word", font=("Segoe UI", 9), state="disabled",
                                 bg=COLORS["surface"], fg=COLORS["text"], relief="flat",
                                 borderwidth=0, highlightthickness=0, padx=10, pady=5,
                                 selectbackground=COLORS["surface_light"], takefocus=True)
        self.chat_canvas = self.chat_messages = self.chat_text
        self.chat_text.grid(row=0, column=0, sticky="nsew", padx=(4, 0), pady=3)
        self.chat_scrollbar = ttk.Scrollbar(card, orient="vertical", command=self._scroll_chat_with_scrollbar,
                                            style="Assistant.Vertical.TScrollbar")
        self.chat_scrollbar.grid(row=0, column=1, sticky="ns", padx=(0, 4), pady=3)
        self.chat_text.configure(yscrollcommand=self._on_chat_scroll)
        self.chat_text.tag_configure("sender", font=("Segoe UI", 7, "bold"), spacing1=5, spacing3=3)
        self.chat_text.tag_configure("body", spacing3=8, lmargin1=3, lmargin2=3, rmargin=3)
        self.chat_text.mark_set("chat_tail", "1.0")
        self.chat_text.mark_gravity("chat_tail", "left")
        self.chat_text.bind("<Configure>", self._resize_chat)
        self.chat_text.bind("<Button-1>", lambda event: self._focus_control(self.chat_text))
        self.chat_text.bind("<Button-3>", self._chat_context_menu)
        self.chat_text.bind("<Up>", lambda event: self._chat_arrow(event, -1))
        self.chat_text.bind("<Down>", lambda event: self._chat_arrow(event, 1))
        self.root.bind("<Up>", lambda event: self._chat_arrow(event, -1), add="+")
        self.root.bind("<Down>", lambda event: self._chat_arrow(event, 1), add="+")
        self._bind_chat_mousewheel(self.chat_text)
        self._bind_chat_mousewheel(self.chat_scrollbar)

    def _apply_chat_visibility(self) -> None:
        self.root.geometry("430x480" if self.show_chat_history else "400x400")
        if self.show_chat_history:
            self.conversation_section.grid()
        else:
            self.conversation_section.grid_remove()

    def _bind_chat_mousewheel(self, widget):
        for sequence in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            widget.bind(sequence, self._scroll_chat_with_mousewheel)

    def _chat_arrow(self, event, direction):
        if self.show_chat_history and event.widget in (self.message_entry, self.chat_text):
            self._scroll_chat_with_scrollbar("scroll", direction, "units")
            return "break"

    def _scroll_chat_with_mousewheel(self, event):
        number = getattr(event, "num", None)
        delta = getattr(event, "delta", 0)
        if number not in (4, 5) and not delta:
            return "break"
        direction = -1 if number == 4 or delta > 0 else 1
        self._scroll_chat_with_scrollbar("scroll", direction, "units")
        return "break"

    def _on_chat_scroll(self, first, last):
        self.chat_scrollbar.set(first, last)

    def _scroll_chat_to_bottom(self):
        if self._chat_layout_after_id is not None:
            self.root.after_cancel(self._chat_layout_after_id)
        self._chat_layout_after_id = None
        if self.closed or self.root.state() == "iconic":
            return
        pending = self._chat_pending_message
        self._chat_pending_message = None
        if pending is not None and self._chat_following:
            self.chat_text.yview(pending)

    def _chat_context_menu(self, event):
        index = self.chat_text.index(f"@{event.x},{event.y}")
        for record in reversed(self.chat_message_rows):
            if self.chat_text.compare(index, ">=", record["start"]) and self.chat_text.compare(index, "<", record["end"]):
                return self._show_message_menu(event, record["text"], record["sender"] == "user")
        return "break"

    def _build_composer(self) -> None:
        composer = tk.Frame(
            self.root,
            bg=COLORS["surface"],
            highlightbackground=COLORS["border"],
            highlightthickness=1,
        )
        composer.grid(row=3, column=0, sticky="ew", padx=18, pady=(0, 17))
        composer.grid_columnconfigure(0, weight=1)
        self.message_entry = tk.Entry(
            composer,
            font=("Segoe UI", 9),
            fg=COLORS["text"],
            insertbackground=COLORS["text"],
            bg=COLORS["surface"],
            relief="flat",
            bd=0,
        )
        self.message_entry.grid(row=0, column=0, sticky="ew", padx=(11, 4), pady=9)
        self.message_entry.bind("<Button-1>", self._activate_text_input, add="+")
        self.message_entry.bind("<Return>", lambda _event: self._send_message())
        self.message_entry.bind("<Button-3>", self._show_entry_menu)
        self.mic_button = tk.Button(
            composer,
            text="🎙",
            command=self._toggle_microphone,
            font=("Segoe UI Emoji", 12),
            fg=COLORS["text"],
            bg=COLORS["surface_light"],
            activebackground=COLORS["border"],
            relief="flat",
            bd=0,
            width=3,
            cursor="hand2",
        )
        self.mic_button.grid(row=0, column=1, padx=3, pady=5)
        tk.Button(
            composer,
            text="➤",
            command=self._send_message,
            font=("Segoe UI", 12, "bold"),
            fg=COLORS["text"],
            bg=COLORS["surface_light"],
            activebackground=COLORS["border"],
            relief="flat",
            bd=0,
            width=3,
            cursor="hand2",
        ).grid(row=0, column=2, padx=(3, 6), pady=5)

    def _schedule_chat_scroll_to_bottom(self):
        if not self.closed and self._chat_layout_after_id is None:
            self._chat_layout_after_id = self.root.after(16, self._scroll_chat_to_bottom)

    def _resize_chat(self, event):
        if self._chat_pending_message is not None:
            self._schedule_chat_scroll_to_bottom()

    def _add_message(self, sender, text):
        view = self.chat_text.index("@0,0")
        self.chat_text.configure(state="normal")
        self.chat_text.delete("chat_tail", "end-1c")
        start = self.chat_text.index("end-1c")
        self.chat_text.insert("end-1c", ("TÚ" if sender == "user" else "ASISTENTE") + "\n", "sender")
        self.chat_text.insert("end-1c", str(text) + "\n", "body")
        end = self.chat_text.index("end-1c")
        self.chat_text.mark_set("chat_tail", end)
        self.chat_text.insert("end-1c", "\n" * 6)
        self.chat_text.configure(state="disabled")
        self.chat_message_rows.append({"start":start, "end":end, "text":str(text), "sender":sender})
        if self._chat_following:
            self._chat_pending_message = start
        else:
            self.chat_text.yview(view)
        self._schedule_chat_scroll_to_bottom()

    def _scroll_chat_with_scrollbar(self, *args):
        self._chat_pending_message = None
        self.chat_text.yview(*args)
        self._chat_following = self.chat_text.yview()[1] >= .999

    def _copy_chat_text(self, text: str) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(text)


    def _show_message_menu(self, event: tk.Event, text: str, is_user: bool = False) -> str:
        if not hasattr(self, "_message_menu"):
            self._message_menu = tk.Menu(self.root, tearoff=False)
        menu = self._message_menu
        menu.delete(0, "end")
        menu.add_command(label="Copiar mensaje" if is_user else "Copiar respuesta",
                         command=lambda: self._copy_chat_text(text))
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()
        return "break"


    def _paste_entry(self) -> None:
        try:
            text = self.root.clipboard_get()
        except tk.TclError:
            return
        self.message_entry.focus_set()
        if self.message_entry.selection_present():
            self.message_entry.delete("sel.first", "sel.last")
        self.message_entry.insert(tk.INSERT, text)
        if hasattr(self, "_interrupt_from_entry"):
            self._interrupt_from_entry()


    def _show_entry_menu(self, event: tk.Event) -> str:
        if not hasattr(self, "_entry_menu"):
            self._entry_menu = tk.Menu(self.root, tearoff=False)
            self._entry_menu.add_command(label="Pegar", command=self._paste_entry)
        try:
            self.root.clipboard_get()
            state = "normal"
        except tk.TclError:
            state = "disabled"
        self._entry_menu.entryconfigure(0, state=state)
        try:
            self._entry_menu.tk_popup(event.x_root, event.y_root)
        finally:
            self._entry_menu.grab_release()
        return "break"


    def _load_chat_history(self) -> None:
        try:
            for role, text in load_chat_messages():
                self._add_message("user" if role == "Usuario" else "assistant", text)
        except OSError as error:
            messagebox.showwarning(
                "No se pudo cargar el historial",
                f"No se pudo cargar el historial de conversación: {error}",
                parent=self.root,
            )

    def _show_basic_commands(self) -> None:
        examples = "\n".join(f"- {command}" for command in COMMAND_EXAMPLES)
        self._add_message("assistant", f"Comandos básicos:\n{examples}")

    def _open_chat_history(self) -> None:
        try:
            CHAT_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
            CHAT_HISTORY_PATH.touch(exist_ok=True)
            if sys.platform == "win32":
                os.startfile(str(CHAT_HISTORY_PATH))
            else:
                webbrowser.open(CHAT_HISTORY_PATH.as_uri())
        except OSError as error:
            messagebox.showerror(
                "No se pudo abrir el historial",
                f"No se pudo abrir el archivo del historial: {error}",
                parent=self.root,
            )

    def _animate_orb(self) -> None:
        self._orb_after_id = None
        if self.closed or not self.root.winfo_viewable():
            return
        now = time.monotonic()
        elapsed = now - self.animation_started
        dt = min(0.1, max(0, now - self._orb_last_frame))
        self._orb_last_frame = now
        talking = self.current_state in {"SPEAKING", "SPEAKING_START"}
        dancing = getattr(self, "_music_playing", False)
        if self._orb_drag_position is None:
            self._orb_rotation_y += dt * (0.48 if dancing else (0.22 if talking else 0.10))
        self._orb_waves = [(start, origin) for start, origin in self._orb_waves if now - start < 3.6]
        cx, cy = self.orb.winfo_width() / 2, self.orb.winfo_height() / 2
        radius = max(1, min(self.orb.winfo_width(), self.orb.winfo_height()) * 0.36)
        dance_tilt = 0.12 * math.sin(elapsed * 3.8) if dancing else 0
        if dancing:
            cy += radius * 0.04 * math.sin(elapsed * 7.6)
        sx, cxr = math.sin(self._orb_rotation_x + dance_tilt), math.cos(self._orb_rotation_x + dance_tilt)
        sy, cyr = math.sin(self._orb_rotation_y), math.cos(self._orb_rotation_y)
        rotated, points, ripples = [], [], []
        for vertex in ORB_VERTICES:
            x, y, z = vertex
            wave = 0.0
            for start, origin in self._orb_waves:
                age = now - start
                distance = math.acos(max(-1, min(1, sum(a * b for a, b in zip(vertex, origin)))))
                envelope = math.exp(-((distance - age * 2.2) / 0.7) ** 2) * math.exp(-age * 0.8)
                wave += 0.11 * math.sin(distance * 9 - age * 10) * envelope
            if talking:
                pulse = (0.055 * math.sin(elapsed * 7.5)
                         + 0.045 * math.sin(elapsed * 10.5 - y * 5 + x * 3)
                         + 0.018 * math.cos(elapsed * 13 + z * 4))
            else:
                pulse = 0.004 * math.sin(elapsed * 1.4 + y * 2)
            if dancing:
                pulse += 0.035 * math.sin(elapsed * 7.6 + y * 4) + 0.025 * math.cos(elapsed * 3.8 + x * 3)
            scale = 1 + wave + pulse
            x, y, z = x * scale, y * scale, z * scale
            rx, rz = x * cyr + z * sy, -x * sy + z * cyr
            ry, rz = y * cxr - rz * sx, y * sx + rz * cxr
            rotated.append((rx, ry, rz))
            perspective = radius * (0.92 + rz * 0.08)
            points.append((cx + rx * perspective, cy - ry * perspective))
            ripples.append(wave + (pulse if talking or dancing else 0))
        self._orb_projected, self._orb_rotated = points, rotated
        background = tuple(int(COLORS["background"][i:i + 2], 16) for i in (1, 3, 5))
        foreground = tuple(int(COLORS["text"][i:i + 2], 16) for i in (1, 3, 5))
        def blend(amount):
            return "#%02x%02x%02x" % tuple(round(a + (b - a) * amount) for a, b in zip(background, foreground))
        depths = [sum(rotated[index][2] for index in face) / len(face) for face in ORB_FACES]
        # Reutilizar los polígonos para evitar tirones.
        for face_index in sorted(range(len(ORB_FACES)), key=lambda index: depths[index]):
            item = self._orb_face_items[face_index]
            depth = depths[face_index]
            if depth < -0.10:
                self.orb.itemconfigure(item, state="hidden")
                continue
            face = ORB_FACES[face_index]
            coordinates = [coordinate for index in face for coordinate in points[index]]
            ripple = abs(sum(ripples[index] for index in face) / len(face))
            self.orb.coords(item, *coordinates)
            self.orb.itemconfigure(
                item, state="normal", fill=blend(min(0.25, 0.025 + max(0, depth) * 0.045 + ripple * 1.5)),
                outline=blend(min(1, (0.68 if talking else 0.46) + max(0, depth) * 0.30 + ripple * 2)),
                width=1.25 if talking else 0.8,
            )
            self.orb.tag_raise(item)
        self._orb_after_id = self.root.after(33, self._animate_orb)

    def _on_orb_press(self, event: tk.Event) -> None:
        if not self._orb_projected:
            return
        cx, cy = self.orb.winfo_width() / 2, self.orb.winfo_height() / 2
        radius = min(self.orb.winfo_width(), self.orb.winfo_height()) * 0.38
        if math.hypot(event.x - cx, event.y - cy) > radius:
            return
        front = [i for i, vertex in enumerate(self._orb_rotated) if vertex[2] >= 0]
        if not front:
            return
        nearest = min(front, key=lambda i: (self._orb_projected[i][0] - event.x) ** 2 + (self._orb_projected[i][1] - event.y) ** 2)
        self._orb_waves.append((time.monotonic(), ORB_VERTICES[nearest]))
        self._orb_waves = self._orb_waves[-4:]
        self._orb_drag_position = (event.x, event.y)
        self.orb.configure(cursor="fleur")

    def _on_orb_drag(self, event: tk.Event) -> None:
        if self._orb_drag_position is None:
            return
        x, y = self._orb_drag_position
        self._orb_rotation_y += (event.x - x) * 0.012
        self._orb_rotation_x += (event.y - y) * 0.012
        self._orb_drag_position = (event.x, event.y)

    def _on_orb_release(self, _event: tk.Event) -> None:
        self._orb_drag_position = None
        self.orb.configure(cursor="hand2")

    def _on_orb_click(self, event: tk.Event) -> None:
        self._orb_interaction_started = time.monotonic()
        self._orb_interaction_direction = -1.0 if event.x < self.orb.winfo_width() / 2 else 1.0

    def _set_state(self, state: str) -> None:
        self.current_state = state if state in STATES else "IDLE"
        self.mic_button.configure(
            fg=COLORS["text"] if self.microphone_enabled else COLORS["muted"],
            state="normal",
        )

    @staticmethod
    def _music_clock(milliseconds):
        seconds = max(0, int(milliseconds) // 1000)
        return f"{seconds // 60}:{seconds % 60:02d}"

    def _draw_music_progress(self):
        canvas = self.music_slider
        width = max(24, canvas.winfo_width())
        left, right, y = 8, width - 8, 10
        fraction = max(0, min(1, self.music_position.get() / max(1, self._music_duration)))
        x = left + (right - left) * fraction
        canvas.delete("all")
        canvas.create_line(left, y, right, y, fill=COLORS["border"], width=4, capstyle="round")
        if fraction > 0:
            canvas.create_line(left, y, x, y, fill="#66C7FF", width=4, capstyle="round")
        if self._music_seekable:
            canvas.create_oval(x - 5, y - 5, x + 5, y + 5, fill=COLORS["text"], outline="")

    def _position_music_pointer(self, event):
        if not self._music_seekable:
            return
        width = max(1, self.music_slider.winfo_width() - 16)
        fraction = max(0, min(1, (event.x - 8) / width))
        self.music_position.set(fraction * self._music_duration)
        self.music_time.configure(text=self._music_clock(self.music_position.get()) + " / " + self._music_clock(self._music_duration))

    def _begin_music_seek(self, event=None):
        self._music_seeking = self._music_seekable
        if self._music_seeking and event is not None:
            self._focus_control(self.music_slider)
            self._position_music_pointer(event)

    def _drag_music_seek(self, event):
        if self._music_seeking:
            self._position_music_pointer(event)

    def _finish_music_seek(self, event=None):
        if self._music_seekable and self._music_seeking:
            if event is not None:
                self._position_music_pointer(event)
            self._send_payload({"type": "music_control", "action": "seek", "value": self.music_position.get()}, notify=False)
        self._music_seeking = False

    def _step_music_seek(self, milliseconds):
        if self._music_seekable:
            position = max(0, min(self._music_duration, self.music_position.get() + milliseconds))
            self.music_position.set(position)
            self._send_payload({"type": "music_control", "action": "seek", "value": position}, notify=False)
        return "break"

    def _music_notice_icon(self):
        try:
            self._load_brand_parts()
            source = self._brand_parts[0]
            scale = max(1, math.ceil(max(source.width(), source.height()) / 26))
            return self._theme_brand_image(source.subsample(scale), self.settings_colors["surface"])
        except (tk.TclError, OSError):
            return None

    def _update_music_state(self, state):
        if not self.closing:
            self.music_notice.observe(state, self.root.state() == "iconic")
        status = state.get("status", "idle")
        self._music_playing = status == "playing"
        if status in ("loading", "extracting", "opening", "playing", "paused"):
            self.music_panel.grid()
        else:
            self.music_panel.grid_remove()
            self._music_seeking = False
        title = state.get("title") or "Pide una canción"
        prefix = {"loading": "Buscando canción… ", "extracting": "Preparando audio… ", "opening": "Cargando audio… ", "paused": "En pausa: ",
                  "ended": "Finalizada: ", "error": "No disponible: "}.get(status, "")
        self.music_title.configure(text=prefix + title)
        self._music_duration = max(0, state.get("duration", 0))
        self._music_seekable = bool(state.get("seekable"))
        self.music_slider.configure(cursor="hand2" if self._music_seekable else "arrow")
        if not self._music_seeking:
            self.music_position.set(state.get("position", 0))
        self._draw_music_progress()
        self.music_time.configure(text=self._music_clock(state.get("position", 0)) + " / " + self._music_clock(self._music_duration))
        available = status in ("playing", "paused", "opening", "ended")
        self.music_toggle_button.configure(text="⏸" if status == "playing" else "▶", state="normal" if available else "disabled")
        self.music_previous_button.configure(state="normal" if available else "disabled")
        self.music_next_button.configure(state="normal" if state.get("next") else "disabled")

    def _receive_event(self, payload: dict[str, Any]) -> None:
        # Actualizar los controles solo desde el hilo de la interfaz.
        event = payload.get("type", "")
        if event == "state":
            value = payload.get("state", "IDLE")
        elif event in {"assistant_response", "user_transcription", "voice_command"}:
            value = payload.get("text", "")
        else:
            value = payload
        self.events.put((event, value))

    def _handle_hotkey(self, action):
        if self.closing or self.closed:
            return
        if action == "toggle_window":
            if self.root.state() in ("iconic", "withdrawn"):
                self._show_without_activation()
            else:
                self._remember_window_geometry()
                self._set_overlay_noactivate(False)
                self.root.iconify()
        else:
            controls = {"toggle_music": ("toggle", None), "seek_back": ("seek_relative", -10000),
                        "seek_forward": ("seek_relative", 10000), "next": ("next", None),
                        "previous": ("previous", None)}
            if action in controls:
                command, value = controls[action]
                self._send_payload({"type": "music_control", "action": command, "value": value}, notify=False)

    def _poll_events(self) -> None:
        while not self.hotkeys.events.empty():
            self._handle_hotkey(self.hotkeys.events.get())
        self._poll_after_id = None
        if self.closed:
            return
        deadline = time.monotonic() + .008
        try:
            for _ in range(40):
                if time.monotonic() >= deadline:
                    break
                event, payload = self.events.get_nowait()
                if event == "headset_state":
                    available = payload.get('available', False)
                    self.assistant_ready = False
                    if not hasattr(self, '_headset_overlay'):
                        self._headset_overlay = tk.Frame(self.root, bg=COLORS['background'])
                        tk.Label(self._headset_overlay, text='Conecta unos auriculares',
                                 font=('Segoe UI', 16, 'bold'), fg=COLORS['text'],
                                 bg=COLORS['background']).pack(pady=(65, 15))
                        tk.Label(self._headset_overlay, text='El asistente estará disponible cuando Windows detecte unos auriculares conectados. Los ajustes y soporte siguen disponibles.',
                                 wraplength=320, justify='center', fg=COLORS['muted'], bg=COLORS['background']).pack(padx=20)
                    if available:
                        self._headset_overlay.place_forget()
                    else:
                        self._headset_overlay.place(x=0, y=90, relwidth=1, relheight=1, height=-90)
                        self._headset_overlay.lift()
                        self._music_playing = False
                elif event == 'voices_installed':
                    window = payload['window']
                    if window.winfo_exists():
                        payload['button'].configure(state='normal', text='Instalar / comprobar voces de Windows')
                        if payload.get('error'):
                            messagebox.showerror('Voces de Windows', payload['error'], parent=window)
                        else:
                            payload['refresh']()
                            messagebox.showinfo('Voces disponibles', 'Ya hay al menos dos voces femeninas y dos masculinas disponibles. Selecciona una voz y guarda los cambios.', parent=window)
                elif event == "runtime_ready":
                    self.assistant_ready = True
                    self._send_payload({"type": "welcome"}, notify=False)
                elif event == "runtime_stopped":
                    self.assistant_ready = False
                    if self._shutdown_pending:
                        self._complete_close()
                        if self.closed:
                            return
                elif event == "runtime_error":
                    if not self.closing and not self._shutdown_pending:
                        messagebox.showerror("Error del asistente", payload.get("message", "Error inesperado."), parent=self.root)
                elif event == "state":
                    self._set_state(payload)
                    if payload == "SPEAKING_END" and (self.closing or self.close_after_speech):
                        self._schedule_close(250)
                elif event == "restart_requested":
                    self._restart_application()
                elif event == "startup_finished":
                    if not self._basic_commands_shown:
                        self._basic_commands_shown = True
                        self._show_basic_commands()
                elif event == "music_state":
                    self._update_music_state(payload)
                elif event == "assistant_response":
                    self._add_message("assistant", payload)
                    self.music_notice.notify(payload)
                elif event == "user_transcription":
                    self._add_message("user", payload)
                elif event == "voice_command":
                    self._submit_voice_command(payload)
                elif event == 'memory_changed':
                    self._memory_updated(payload['action'],payload.get('count',0))
                elif event == 'memory_cleared':
                    self._memory_updated('clear_memory')
                elif event == 'memory_error':
                    label = getattr(self,'memory_status',None)
                    if label is not None and label.winfo_exists():
                        label.configure(text=payload.get('message','No pude actualizar la memoria.'))
                    messagebox.showerror('Memoria',payload.get('message','No pude actualizar la memoria.'),parent=self.settings_window or self.root)
                elif event == "history_error":
                    messagebox.showwarning(
                        "No se pudo guardar el historial",
                        payload.get("message", "No se pudo escribir el historial del chat."),
                        parent=self.root,
                    )
                elif event == "microphones":
                    self._update_microphone_options(payload)
                elif event == "microphone_level":
                    level = payload.get("level", 0)
                    message = self._microphone_signal.update(level, time.monotonic())
                    label = self.microphone_level_label
                    if label is not None and label.winfo_exists():
                        if label.cget("text") != message:
                            label.configure(text=message, fg=self.settings_colors["muted"])
                elif event == "microphone_status":
                    self._update_microphone_status(payload)
                elif event == "settings_error":
                    if self.microphone_status is not None and self.microphone_status.winfo_exists():
                        self.microphone_status.configure(
                            text=payload.get("message", "No se pudo cambiar el micrófono."),
                            fg=self.settings_colors["red"],
                        )
                    if self.settings_save_button is not None and self.settings_save_button.winfo_exists():
                        self.settings_save_button.configure(state="normal", text="Guardar cambios")
                elif event == "settings_saved":
                    self.show_chat_history = load_config().get("show_chat_history", True) is not False
                    self._apply_chat_visibility()
                    if self.settings_window is not None and self.settings_window.winfo_exists():
                        self.settings_window.destroy()
                    self.settings_window = None
                    if self._send_payload({"type": "prepare_restart"}, notify=False):
                        self._restart_after_id = self.root.after(2500, self._restart_application)
                    else:
                        self._restart_application()
                elif event == "restart_prepared":
                    self._restart_application()
                elif event == "confirmation_required":
                    confirmed = messagebox.askyesno(
                        "Confirmar acción del sistema",
                        payload.get("message", "¿Confirmas esta acción?"),
                        parent=self.root,
                    )
                    self._send_payload(
                        {
                            "type": "system_action_confirmation",
                            "action": payload.get("action"),
                            "confirmed": confirmed,
                        },
                        notify=False,
                    )
                elif event == "close_requested":
                    self.close_after_speech = True
                    self._schedule_close(5000)
                elif event == "api_test_result":
                    success, result, status, button = payload
                    if status.winfo_exists():
                        status.configure(
                            text=result
                            if success
                            else f"La API no funciona: {result}",
                            fg=self.settings_colors["green"] if success else self.settings_colors["red"],
                        )
                    if button.winfo_exists():
                        button.configure(state="normal", text="Probar API key")
        except queue.Empty:
            pass
        if not self.closed:
            self._poll_after_id = self.root.after(10 if not self.events.empty() else 80, self._poll_events)

    def _send_payload(self, payload: dict[str, Any], notify: bool = True) -> bool:
        if self.assistant_ready and self.runtime.submit(payload):
            return True
        if notify:
            messagebox.showwarning("Asistente no disponible", "El asistente todavía no está listo o se está cerrando.", parent=self.root)
        return False

    def _send_message(self) -> None:
        text = self.message_entry.get().strip()
        if not text:
            return
        if self._send_payload({"type": "user_text", "text": text}):
            self.message_entry.delete(0, tk.END)
            self._set_state("PROCESSING")

    def _submit_voice_command(self, text: str) -> None:
        command = text.strip()
        if not command:
            return
        self.message_entry.delete(0, tk.END)
        self.message_entry.insert(0, command)
        self._send_message()

    def _toggle_microphone(self) -> None:
        enabled = not self.microphone_enabled
        if self._send_payload({"type": "microphone", "enabled": enabled, "announce": True}):
            self.microphone_enabled = enabled
            self._set_state("LISTENING" if enabled else "MICROPHONE_OFF")

    def _request_microphones(self) -> None:
        if self.microphone_status is not None and self.microphone_status.winfo_exists():
            self.microphone_status.configure(text="Detectando micrófonos…", fg=self.settings_colors["muted"])
        self._send_payload({"type": "list_microphones"}, notify=False)

    def _update_microphone_options(self, payload: dict[str, Any]) -> None:
        combo = self.microphone_combo
        status = self.microphone_status
        if combo is None or status is None or not combo.winfo_exists() or not status.winfo_exists():
            return
        devices = payload.get("devices", [])
        has_default = any(item.get("is_default") for item in devices)
        options: dict[str, int | None] = {"Predeterminado del sistema": None} if has_default else {}
        selected = payload.get("selected")
        selected_label = "Predeterminado del sistema"
        for device in devices:
            if device.get("is_default"):
                continue
            try:
                index = int(device["index"])
                name = str(device["name"]).strip() or f"Micrófono {index + 1}"
            except (KeyError, TypeError, ValueError):
                continue
            label = f"{name} ({index + 1})"
            options[label] = index
            if selected == index:
                selected_label = label
        self.microphone_options = options
        combo["values"] = tuple(options)
        combo.set(selected_label if selected_label in options else next(iter(options), "Sin micrófonos disponibles"))
        error = payload.get("error")
        if error:
            status.configure(text=f"No se pudieron detectar micrófonos: {error}", fg=self.settings_colors["red"])
        elif not payload.get("devices"):
            status.configure(text="No se detectaron micrófonos disponibles.", fg=self.settings_colors["muted"])
        else:
            status.configure(text="Elige el micrófono que quieres utilizar.", fg=self.settings_colors["muted"])

    def _update_microphone_status(self, payload: dict[str, Any]) -> None:
        state = payload.get("state")
        message = payload.get("message", "")
        self._voice_calibration_status_state = str(state or "")
        self._voice_calibration_status_message = str(message or "")
        calibration_status = self.microphone_calibration_status
        if calibration_status is not None and calibration_status.winfo_exists():
            status_messages = {
                "CALIBRATING_MICROPHONE": "Analizando el ruido ambiental…",
                "MICROPHONE_READY": "Calibración completada.",
                "LISTENING": "Micrófono listo.",
                "MICROPHONE_ERROR": message or "No se pudo iniciar el reconocimiento offline.",
            }
            if state in status_messages:
                calibration_status.configure(
                    text=status_messages[state],
                    fg=self.settings_colors["red"] if state == "MICROPHONE_ERROR" else self.settings_colors["muted"],
                )
        button = self.microphone_calibrate_button
        if button is not None and button.winfo_exists():
            button.configure(
                state="disabled" if state == "CALIBRATING_MICROPHONE" else "normal",
                text="Calibrando…" if state == "CALIBRATING_MICROPHONE" else "Calibrar micrófono",
            )
        if state == "MICROPHONE_ERROR" and message:
            messagebox.showwarning("Reconocimiento de voz offline", message, parent=self.root)

    def _request_microphone_calibration(self) -> None:
        if self.microphone_calibration_status is not None and self.microphone_calibration_status.winfo_exists():
            self.microphone_calibration_status.configure(
                text="Preparando la calibración…",
                fg=self.settings_colors["muted"],
            )
        if self.microphone_calibrate_button is not None and self.microphone_calibrate_button.winfo_exists():
            self.microphone_calibrate_button.configure(state="disabled", text="Calibrando…")
        if not self._send_payload({"type": "calibrate_microphone"}, notify=False):
            if self.microphone_calibration_status is not None and self.microphone_calibration_status.winfo_exists():
                self.microphone_calibration_status.configure(
                    text="No se pudo conectar con el asistente.",
                    fg=self.settings_colors["red"],
                )
            if self.microphone_calibrate_button is not None and self.microphone_calibrate_button.winfo_exists():
                self.microphone_calibrate_button.configure(state="normal", text="Calibrar micrófono")

    def _test_api_key(self, api_key: str, status: tk.Label, button: tk.Button, provider: str = "openai", model: str = "") -> None:
        key = api_key.strip()
        if not key:
            status.configure(text="Escribe una API key para poder probarla.", fg=self.settings_colors["amber"])
            return
        status.configure(text="Probando la API key…", fg=self.settings_colors["muted"])
        button.configure(state="disabled", text="Probando…")

        def run_test() -> None:
            try:
                AIClient(key, provider, model).test_connection()
                result: tuple[bool, str] = (True, f"{provider}: conexión correcta.")
            except Exception as error:
                result = (False, str(error) or "No se pudo conectar con la API.")
            self.events.put(("api_test_result", (*result, status, button)))

        threading.Thread(target=run_test, daemon=True).start()

    def _open_settings(self) -> None:
        if self.settings_window is not None and self.settings_window.winfo_exists():
            self.settings_window.lift()
            return
        config = load_config()
        window = tk.Toplevel(self.root, bg=self.settings_colors["background"])
        window.withdraw()
        self.settings_window = window
        window.bind("<Destroy>", lambda event: self.hotkeys.suspend(False) if event.widget is window else None, add="+")
        window.title("Configuración del asistente")
        window.bind("<Map>", lambda event: window.after_idle(lambda: self._apply_titlebar_theme(window)) if event.widget is window else None, add="+")
        window.geometry("800x620")
        window.minsize(700, 500)
        window.after_idle(lambda: self._apply_titlebar_theme(window))
        window.resizable(False, False)
        window.configure(bg=self.settings_colors["background"])
        window.transient(self.root)
        window.grid_columnconfigure(0, weight=1)
        window.grid_rowconfigure(0, weight=1)
        window.grid_rowconfigure(1, weight=0, minsize=90)
        footer = tk.Frame(window, bg=self.settings_colors["background"])
        footer.grid(row=1, column=0, sticky="ew", padx=16, pady=(0, 8))
        layout = tk.Frame(window, bg=self.settings_colors["background"])
        layout.grid(row=0, column=0, sticky="nsew")
        sidebar = tk.Frame(layout, bg=self.settings_colors["surface"], width=190)
        sidebar.pack(side="left", fill="y", padx=(10, 0), pady=10)
        sidebar.pack_propagate(False)
        logo_header = tk.Frame(sidebar, bg=self.settings_colors["surface"])
        logo_header.pack(fill="x", padx=10, pady=(14, 12))
        logo_header.grid_columnconfigure(0, weight=1)
        self._build_brand_header(logo_header)
        self._settings_pages = {}
        self._settings_nav = {}
        self._settings_sidebar = sidebar
        scroll_area = tk.Frame(layout, bg=self.settings_colors["background"])
        scroll_area.pack(fill="both", expand=True, padx=10, pady=10)
        scroll_area.grid_rowconfigure(0, weight=1)
        scroll_area.grid_columnconfigure(0, weight=1)
        canvas = tk.Canvas(scroll_area, bg=self.settings_colors["background"], highlightthickness=0)
        scrollbar = ttk.Scrollbar(
            scroll_area,
            orient="vertical",
            command=canvas.yview,
            style="Assistant.Vertical.TScrollbar",
        )
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")
        body = tk.Frame(canvas, bg=self.settings_colors["background"])
        body_window = canvas.create_window((14, 12), window=body, anchor="nw")
        body.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(body_window, width=max(0, event.width - 28)))
        tk.Label(body, text="Configuración", font=("Segoe UI", 20, "bold"), fg=self.settings_colors["text"], bg=self.settings_colors["background"]).pack(anchor="w")
        tk.Label(
            body,
            text="Personaliza cómo trabaja tu asistente.",
            font=("Segoe UI", 9),
            fg=self.settings_colors["muted"],
            bg=self.settings_colors["background"],
        ).pack(anchor="w", pady=(4, 12))

        self._settings_canvas = canvas
        settings_body = body
        body = self._settings_section(settings_body, 'General')
        self._select_settings_section('General')
        username = self._settings_entry(body, "Nombre de usuario")
        username.insert(0, config.get("username", ""))

        wake_word = self._settings_entry(body, "Palabra clave de activación")
        wake_word.insert(0, config.get("wake_word", "Computadora"))

        self._settings_heading(body, "Iniciar al prender la PC").pack(anchor="w", pady=(16, 6))
        startup_choice = ttk.Combobox(body, values=("Sí", "No"), state="readonly")
        startup_choice.set("Sí" if config.get("startup_enabled", False) else "No")
        startup_choice.pack(fill="x")
        if not getattr(sys, "frozen", False):
            startup_choice.configure(state="disabled")
            tk.Label(body, text="Disponible al usar la versión ejecutable (.exe).",
                     font=("Segoe UI", 8), fg=self.settings_colors["muted"], bg=self.settings_colors["background"],
                     wraplength=340, justify="left").pack(anchor="w", pady=(4, 0))

        body = self._settings_section(settings_body, 'Apariencia')
        self._settings_heading(body, "Tema de la interfaz").pack(anchor="w", pady=(18, 6))
        theme = ttk.Combobox(body, values=("Claro", "Oscuro"), state="readonly", font=("Segoe UI", 10))
        theme.set("Oscuro" if config.get("ui_theme") == "dark" else "Claro")
        theme.pack(fill="x", ipady=2)
        self._settings_heading(body, "Historial de chat en la interfaz principal").pack(anchor="w", pady=(16, 7))
        chat_visibility = ttk.Combobox(body, values=("Mostrar", "Ocultar"), state="readonly")
        chat_visibility.set("Mostrar" if config.get("show_chat_history", True) is not False else "Ocultar")
        chat_visibility.pack(fill="x")

        body = self._settings_section(settings_body, 'Voz del asistente')
        self._settings_heading(body, "Voz").pack(anchor="w", pady=(8, 6))
        voice_options = {"Predeterminada de Windows": ""}
        for index, (identifier, name) in enumerate(list_available_voices(), 1):
            voice_options[f"{name} ({index})"] = identifier
        selected_id = config.get("voice_id", "")
        voice_choice = ttk.Combobox(body, values=list(voice_options), state="readonly")
        voice_choice.set(next((name for name, identifier in voice_options.items() if identifier == selected_id), "Predeterminada de Windows"))
        voice_choice.pack(fill="x", ipady=2)
        def refresh_voices():
            current = voice_options.get(voice_choice.get(), selected_id)
            voice_options.clear()
            voice_options["Predeterminada de Windows"] = ""
            for index, (identifier, name) in enumerate(list_available_voices(), 1):
                voice_options[f"{name} ({index})"] = identifier
            voice_choice.configure(values=list(voice_options))
            voice_choice.set(next((name for name, identifier in voice_options.items() if identifier == current), "Predeterminada de Windows"))
        def download_voices():
            if sys.platform == "win32" and not ctypes.windll.shell32.IsUserAnAdmin():
                try:
                    os.startfile("ms-settings:speech")
                except OSError:
                    messagebox.showerror("Voces de Windows", "Abre Configuración de Windows y busca Voz.", parent=window)
                return
            install_button.configure(state='disabled', text='Comprobando voces…')
            def run():
                try:
                    install_windows_voices()
                    self.events.put(('voices_installed', {'window':window, 'refresh':refresh_voices, 'button':install_button}))
                except Exception as error:
                    self.events.put(('voices_installed', {'window':window, 'button':install_button, 'error':str(error)}))
            threading.Thread(target=run, name='LeytechVoiceInstall', daemon=True).start()
        voice_actions = tk.Frame(body, bg=self.settings_colors['background'])
        voice_actions.pack(fill='x', pady=(8, 0))
        install_button = tk.Button(voice_actions, text='Añadir voces de Windows', command=download_voices,
                                   fg=self.settings_colors['text'], bg=self.settings_colors['surface_light'], relief='flat', padx=10, pady=8)
        install_button.pack(side='left')
        tk.Button(voice_actions, text='Actualizar lista', command=refresh_voices, fg=self.settings_colors['text'],
                  bg=self.settings_colors['surface_light'], relief='flat', padx=10, pady=8).pack(side='left', padx=(6, 0))
        tk.Label(body, text='Después de añadir voces en Windows, pulsa Actualizar lista.',
                 wraplength=460, justify='left', fg=self.settings_colors['muted'], bg=self.settings_colors['background']).pack(anchor='w', pady=(8, 0))

        tk.Label(body, text="Voces instaladas en Windows. Puedes añadir voces compatibles en los ajustes de voz de Windows.",
                 wraplength=460, justify="left", fg=self.settings_colors["muted"], bg=self.settings_colors["background"]).pack(anchor="w", pady=(6, 0))
        self._settings_heading(body, "Velocidad de voz del asistente").pack(anchor="w", pady=(18, 6))
        speed = tk.DoubleVar(value=normalize_voice_speed(config.get("voice_speed", "normal")))
        BlueSlider(body, minimum=100, maximum=260, variable=speed, step=1, colors=self.settings_colors).pack(fill="x", pady=(2, 0))
        speed_labels = tk.Frame(body, bg=self.settings_colors["background"])
        speed_labels.pack(fill="x", pady=(2, 0))
        for column, (caption, anchor) in enumerate((("Lento", "w"), ("Normal", "center"), ("Rápido", "e"))):
            speed_labels.grid_columnconfigure(column, weight=1, uniform="voice_speed")
            tk.Label(speed_labels, text=caption, anchor=anchor, font=("Segoe UI", 9),
                     fg=self.settings_colors["muted"], bg=self.settings_colors["background"]).grid(row=0, column=column, sticky="ew")

        self._settings_heading(body, "Volumen de voz del asistente").pack(anchor="w", pady=(18, 6))
        voice_volume = tk.IntVar(value=max(0, min(100, int(config.get("voice_volume", 100)))))
        volume_control = tk.Frame(body, bg=self.settings_colors["background"])
        volume_control.pack(fill="x")
        volume_value = tk.Label(
            volume_control,
            text=f"{voice_volume.get()}%",
            font=("Segoe UI", 9),
            fg=self.settings_colors["text"],
            bg=self.settings_colors["background"],
            width=5,
            anchor="e",
        )
        volume_value.pack(side="right", padx=(8, 0))
        BlueSlider(
            volume_control,
            minimum=0,
            maximum=100,
            colors=self.settings_colors,
            variable=voice_volume,
            command=lambda value: volume_value.configure(text=f"{round(float(value))}%"),
        ).pack(side="left", fill="x", expand=True)

        body = self._settings_section(settings_body, 'Micrófono y reconocimiento')
        microphone_heading = tk.Frame(body, bg=self.settings_colors["background"])
        microphone_heading.pack(fill="x", pady=(18, 6))
        self._settings_heading(microphone_heading, "Micrófono de entrada").pack(side="left")
        tk.Button(
            microphone_heading,
            text="Actualizar",
            command=self._request_microphones,
            font=("Segoe UI", 8),
            fg=self.settings_colors["cyan"],
            bg=self.settings_colors["background"],
            activebackground=self.settings_colors["surface"],
            relief="flat",
            bd=0,
            cursor="hand2",
        ).pack(side="right")
        self.microphone_combo = ttk.Combobox(body, state="readonly", font=("Segoe UI", 9))
        self.microphone_combo.pack(fill="x", ipady=2)
        self.microphone_status = tk.Label(
            body,
            text="Detectando micrófonos…",
            font=("Segoe UI", 8),
            fg=self.settings_colors["muted"],
            bg=self.settings_colors["background"],
            anchor="w",
        )
        self.microphone_status.pack(fill="x", pady=(3, 0))
        self.microphone_level_label = tk.Label(body, text="Esperando señal del micrófono…", font=("Segoe UI", 8),
                                              fg=self.settings_colors["muted"], bg=self.settings_colors["background"],
                                              wraplength=420, justify="left")
        self.microphone_level_label.pack(fill="x", pady=(3, 0))
        self.microphone_options = {"Predeterminado del sistema": None}
        self.microphone_combo["values"] = tuple(self.microphone_options)
        self.microphone_combo.set("Predeterminado del sistema")
        self._request_microphones()

        self._settings_heading(body, "Reconocimiento de voz").pack(anchor="w", pady=(18, 6))
        recognition_mode = ttk.Combobox(
            body,
            values=("Offline", "Online"),
            state="readonly",
            font=("Segoe UI", 9),
        )
        recognition_mode.set(
            "Online" if config.get("voice_recognition_mode", "offline") == "online" else "Offline"
        )
        recognition_mode.pack(fill="x", ipady=2)
        recognition_mode_hint = tk.Label(
            body,
            text="En modo Offline no necesitas Internet. La voz se procesa en tu equipo y, a veces, puede confundir algunas palabras.",
            font=("Segoe UI", 8),
            fg=self.settings_colors["muted"],
            bg=self.settings_colors["background"],
            justify="left",
            wraplength=350,
            anchor="w",
        )

        def update_recognition_mode_hint(_event: tk.Event | None = None) -> None:
            if recognition_mode.get() == "Offline":
                recognition_mode_hint.pack(fill="x", pady=(4, 0))
            else:
                recognition_mode_hint.pack_forget()

        recognition_mode.bind("<<ComboboxSelected>>", update_recognition_mode_hint)
        update_recognition_mode_hint()

        self._settings_heading(body, "Idiomas de reconocimiento instalados").pack(anchor="w", pady=(18, 6))
        languages = installed_languages()
        tk.Label(body, text=" · ".join(languages.values()) or "Ningún modelo instalado",
                 fg=self.settings_colors["text"], bg=self.settings_colors["background"]).pack(anchor="w")
        english_music = tk.BooleanVar(value=bool(config.get("recognition_english_music", True)))
        tk.Checkbutton(body, text="Reconocer también títulos de canciones en inglés", variable=english_music,
                       fg=self.settings_colors["text"], bg=self.settings_colors["background"],
                       selectcolor=self.settings_colors["surface"], activebackground=self.settings_colors["background"]).pack(anchor="w", pady=(6, 0))
        tk.Label(body, text="Los comandos siguen en español. El audio del título se compara con el modelo inglés cuando pides una canción. Estos idiomas son independientes de las voces de Windows.",
                 wraplength=420, justify="left", fg=self.settings_colors["muted"],
                 bg=self.settings_colors["background"]).pack(anchor="w", pady=(4, 0))

        self._settings_heading(body, "Sensibilidad del micrófono").pack(anchor="w", pady=(18, 6))
        sensitivity_labels = {
            "Automática": "auto",
            "Baja": "low",
            "Normal": "normal",
            "Alta": "high",
            "Muy alta": "very_high",
            "Manual": "manual",
        }
        sensitivity = ttk.Combobox(
            body,
            values=tuple(sensitivity_labels),
            state="readonly",
            font=("Segoe UI", 9),
        )
        sensitivity.set(
            next(
                (
                    label
                    for label, value in sensitivity_labels.items()
                    if value == config.get("microphone_sensitivity", "auto")
                ),
                "Automática",
            )
        )
        sensitivity.pack(fill="x", ipady=2)
        threshold_row = tk.Frame(body, bg=self.settings_colors["background"])
        threshold_row.pack(fill="x", pady=(7, 0))
        tk.Label(
            threshold_row,
            text="Umbral manual:",
            font=("Segoe UI", 9),
            fg=self.settings_colors["muted"],
            bg=self.settings_colors["background"],
        ).pack(side="left")
        manual_threshold = tk.Spinbox(
            threshold_row,
            from_=1,
            to=32767,
            width=8,
            textvariable=self._new_microphone_threshold_variable(
                config.get("microphone_manual_threshold", 500)
            ),
            font=("Segoe UI", 9),
            fg=self.settings_colors["text"],
            insertbackground=self.settings_colors["text"],
            bg=self.settings_colors["surface"],
            buttonbackground=self.settings_colors["surface_light"],
            relief="flat",
        )
        manual_threshold.pack(side="right")
        def update_sensitivity_controls(_event: tk.Event | None = None) -> None:
            manual_mode = sensitivity.get() == "Manual"
            manual_threshold.configure(state="normal" if manual_mode else "disabled")
            dynamic_adjustment_control.configure(state="disabled" if manual_mode else "normal")

        sensitivity.bind("<<ComboboxSelected>>", update_sensitivity_controls)
        dynamic_adjustment = tk.BooleanVar(value=bool(config.get("microphone_dynamic_adjustment", True)))
        dynamic_adjustment_control = tk.Checkbutton(
            body,
            text="Ajuste dinámico",
            variable=dynamic_adjustment,
            font=("Segoe UI", 9),
            fg=self.settings_colors["text"],
            selectcolor=self.settings_colors["surface"],
            activebackground=self.settings_colors["background"],
            activeforeground=self.settings_colors["text"],
            bg=self.settings_colors["background"],
            relief="flat",
        )
        dynamic_adjustment_control.pack(anchor="w", pady=(5, 0))
        update_sensitivity_controls()
        calibration_row = tk.Frame(body, bg=self.settings_colors["background"])
        calibration_row.pack(fill="x", pady=(6, 0))
        self.microphone_calibration_status = tk.Label(
            calibration_row,
            text="La calibración se ejecuta en segundo plano.",
            font=("Segoe UI", 8),
            fg=self.settings_colors["muted"],
            bg=self.settings_colors["background"],
            anchor="w",
        )
        self.microphone_calibration_status.pack(side="left", fill="x", expand=True)
        self.microphone_calibrate_button = tk.Button(
            calibration_row,
            text="Calibrar micrófono",
            command=self._request_microphone_calibration,
            font=("Segoe UI", 8),
            fg=self.settings_colors["text"],
            bg=self.settings_colors["surface_light"],
            activebackground=self.settings_colors["border"],
            relief="flat",
            bd=0,
            padx=8,
            pady=5,
            cursor="hand2",
        )
        self.microphone_calibrate_button.pack(side="right")
        if self._voice_calibration_status_state:
            self._update_microphone_status(
                {
                    "state": self._voice_calibration_status_state,
                    "message": self._voice_calibration_status_message,
                }
            )

        body = self._settings_section(settings_body, 'Inteligencia artificial')
        self._settings_heading(body, "Proveedor de IA (opcional)").pack(anchor="w", pady=(12, 7))
        provider = ttk.Combobox(body, values=("OpenAI", "OpenRouter"), state="readonly", font=("Segoe UI", 10))
        provider.set("OpenRouter" if config.get("ai_provider") == "openrouter" else "OpenAI")
        provider.pack(fill="x", ipady=2)
        ai_draft = {
            "openai": [config.get("api_key", ""), config.get("openai_model", "gpt-4o-mini")],
            "openrouter": [config.get("openrouter_api_key", ""), config.get("openrouter_model", "openrouter/free")],
        }
        selected_provider = [provider.get().lower()]
        self._settings_heading(body, "API key").pack(anchor="w", pady=(12, 7))
        api_row = tk.Frame(body, bg=self.settings_colors["background"])
        api_row.pack(fill="x")
        api_key = tk.Entry(
            api_row,
            font=("Segoe UI", 10),
            fg=self.settings_colors["text"],
            insertbackground=self.settings_colors["text"],
            bg=self.settings_colors["surface"],
            relief="flat",
            bd=0,
            show="•",
        )
        api_key.pack(side="left", fill="x", expand=True, ipady=9, padx=(1, 7))
        visibility_button = tk.Button(
            api_row,
            text="Mostrar",
            font=("Segoe UI", 8),
            fg=self.settings_colors["cyan"],
            bg=self.settings_colors["surface_light"],
            activebackground=self.settings_colors["border"],
            relief="flat",
            bd=0,
            padx=10,
            pady=7,
            cursor="hand2",
        )

        def toggle_api_key_visibility() -> None:
            visible = api_key.cget("show") == ""
            api_key.configure(show="•" if visible else "")
            visibility_button.configure(text="Mostrar" if visible else "Ocultar")

        visibility_button.configure(command=toggle_api_key_visibility)
        visibility_button.pack(side="right")
        api_key.insert(0, ai_draft[selected_provider[0]][0])
        model = self._settings_entry(body, "Modelo de IA")
        model.insert(0, ai_draft[selected_provider[0]][1])
        tk.Label(body, text="OpenRouter: openrouter/free elige un modelo gratuito.\nSin clave, las funciones offline siguen disponibles.",
                 font=("Segoe UI", 8), fg=self.settings_colors["muted"], bg=self.settings_colors["background"],
                 justify="left", wraplength=340).pack(anchor="w", pady=(5, 0))

        def switch_provider(_event=None) -> None:
            ai_draft[selected_provider[0]] = [api_key.get().strip(), model.get().strip()]
            selected_provider[0] = provider.get().lower()
            api_key.delete(0, "end")
            api_key.insert(0, ai_draft[selected_provider[0]][0])
            api_key.configure(show="•")
            visibility_button.configure(text="Mostrar")
            model.delete(0, "end")
            model.insert(0, ai_draft[selected_provider[0]][1])
            api_status.configure(text="")

        provider.bind("<<ComboboxSelected>>", switch_provider)

        api_actions = tk.Frame(body, bg=self.settings_colors["background"])
        api_actions.pack(fill="x", pady=(6, 0))
        api_status = tk.Label(
            api_actions,
            text="",
            font=("Segoe UI", 8),
            fg=self.settings_colors["muted"],
            bg=self.settings_colors["background"],
            justify="left",
            wraplength=280,
        )
        api_status.pack(side="left", fill="x", expand=True)
        self.settings_api_status = api_status
        test_button = tk.Button(
            api_actions,
            text="Probar API key",
            command=lambda: test_selected_provider(),
            font=("Segoe UI", 8, "bold"),
            fg=self.settings_colors["text"],
            bg=self.settings_colors["surface_light"],
            activebackground=self.settings_colors["border"],
            relief="flat",
            bd=0,
            padx=10,
            pady=7,
            cursor="hand2",
        )
        test_button.pack(side="right")
        self.current_api_test_button = test_button

        def test_selected_provider() -> None:
            self._test_api_key(api_key.get(), api_status, test_button, provider.get().lower(), model.get())

        self._settings_heading(body, 'Memoria de la IA').pack(anchor='w', pady=(18,7))
        tk.Label(body,text='La memoria es el historial de chat. Exportarla no incluye tus ajustes ni claves API.',
                 wraplength=420,justify='left',fg=self.settings_colors['muted'],bg=self.settings_colors['background']).pack(anchor='w')
        memory_actions = tk.Frame(body,bg=self.settings_colors['background'])
        memory_actions.pack(fill='x',pady=(8,4))
        for label,action in (('Formatear','clear_memory'),('Exportar','memory_export'),('Importar','memory_import')):
            tk.Button(memory_actions,text=label,command=lambda operation=action:self._memory_action(operation),
                      fg=self.settings_colors['text'],bg=self.settings_colors['surface_light'],relief='flat',padx=12,pady=8).pack(side='left',padx=(0,6))
        self.memory_status = tk.Label(body,text='',wraplength=420,justify='left',fg=self.settings_colors['muted'],bg=self.settings_colors['background'])
        self.memory_status.pack(anchor='w',pady=(4,0))

        body = self._settings_section(settings_body, 'Historial y configuración')
        self._settings_heading(body, "Historial de chat").pack(anchor="w", pady=(12, 7))
        tk.Button(body, text="Abrir historial de chat", command=self._open_chat_history,
                  font=("Segoe UI", 9), fg=self.settings_colors["text"], bg=self.settings_colors["surface_light"],
                  activebackground=self.settings_colors["border"], relief="flat", bd=0,
                  padx=12, pady=8, cursor="hand2").pack(anchor="w")

        transfer_actions = tk.Frame(body, bg=self.settings_colors["background"])
        transfer_actions.pack(fill="x", pady=(12, 0))
        for column in range(3):
            transfer_actions.grid_columnconfigure(column, weight=1, uniform="settings_transfer")
        tk.Button(
            transfer_actions,
            text="Exportar configuración",
            command=self._export_config,
            font=("Segoe UI", 8),
            fg=self.settings_colors["text"],
            bg=self.settings_colors["surface_light"],
            activebackground=self.settings_colors["border"],
            relief="flat",
            bd=0,
            padx=9,
            pady=6,
            cursor="hand2",
        ).grid(row=0, column=0, sticky="ew", padx=(0, 3))
        tk.Button(
            transfer_actions,
            text="Restablecer ajustes",
            command=lambda: self._reset_settings(window),
            font=("Segoe UI", 8),
            fg=self.settings_colors["text"],
            bg=self.settings_colors["surface_light"],
            activebackground=self.settings_colors["border"],
            relief="flat",
            bd=0,
            padx=5,
            pady=6,
            cursor="hand2",
        ).grid(row=0, column=1, sticky="ew", padx=3)
        tk.Button(
            transfer_actions,
            text="Importar configuración",
            command=lambda: self._import_config(window),
            font=("Segoe UI", 8),
            fg=self.settings_colors["text"],
            bg=self.settings_colors["surface_light"],
            activebackground=self.settings_colors["border"],
            relief="flat",
            bd=0,
            padx=9,
            pady=6,
            cursor="hand2",
        ).grid(row=0, column=2, sticky="ew", padx=(3, 0))

        updates_panel = self._settings_section(settings_body, "Actualizaciones")
        self.updates.add_to(updates_panel, window, self.settings_colors)
        shortcuts_page = self._settings_section(settings_body, "Atajos de teclado")
        tk.Label(shortcuts_page, text="Pulsa un campo y luego la tecla o combinación que quieras usar. Las teclas asignadas quedan reservadas para el asistente; se recomienda Ctrl+Alt para no interferir con el juego.",
                 wraplength=440, justify="left", bg=self.settings_colors["background"], fg=self.settings_colors["muted"]).pack(anchor="w", pady=(0, 8))
        shortcut_entries = {}
        for action, label in HOTKEY_LABELS.items():
            self._settings_heading(shortcuts_page, label).pack(anchor="w", pady=(12, 6))
            row = tk.Frame(shortcuts_page, bg=self.settings_colors["background"])
            row.pack(fill="x")
            entry = ShortcutCapture(row, config.get("hotkeys", DEFAULT_HOTKEYS).get(action, DEFAULT_HOTKEYS[action]),
                                    on_capture=self.hotkeys.suspend, font=("Segoe UI", 10), readonlybackground=self.settings_colors["surface"],
                                    fg=self.settings_colors["text"], relief="flat")
            entry.pack(side="left", fill="x", expand=True, ipady=7)
            tk.Button(row, text="Desactivar", command=lambda field=entry: field.set("Desactivado")).pack(side="right", padx=(6, 0))
            shortcut_entries[action] = entry
        tk.Button(shortcuts_page, text="Restablecer atajos", command=lambda: [
            entry.set(DEFAULT_HOTKEYS[action])
            for action, entry in shortcut_entries.items()]).pack(anchor="w", pady=10)
        if self.hotkeys.errors:
            tk.Label(shortcuts_page, text="\n".join(self.hotkeys.errors), wraplength=440, justify="left",
                     bg=self.settings_colors["background"], fg=self.settings_colors["red"]).pack(anchor="w")
        self._build_support_page(settings_body, window)
        self._select_settings_section('General')
        body = footer
        actions = tk.Frame(body, bg=self.settings_colors["background"])
        actions.pack(fill="x", pady=(8, 0))
        tk.Button(
            actions,
            text="Cancelar",
            command=window.destroy,
            font=("Segoe UI", 9),
            fg=self.settings_colors["muted"],
            bg=self.settings_colors["surface_light"],
            relief="flat",
            bd=0,
            padx=18,
            pady=9,
            cursor="hand2",
        ).pack(side="right", padx=(8, 0))
        self.settings_save_button = tk.Button(
            actions,
            text="Guardar cambios",
            command=lambda: self._save_settings(
                window,
                api_key,
                username,
                wake_word,
                speed,
                voice_volume,
                theme,
                recognition_mode,
                sensitivity,
                manual_threshold,
                dynamic_adjustment,
                sensitivity_labels,
                chat_visibility,
                (provider, model, ai_draft),
                startup_choice=startup_choice,
                voice_selection=(voice_choice, voice_options),
                shortcut_entries=shortcut_entries,
                english_music=english_music,
            ),
            font=("Segoe UI", 9, "bold"),
            fg=self.settings_colors["text"],
            bg=self.settings_colors["surface_light"],
            activebackground=self.settings_colors["border"],
            relief="flat",
            bd=0,
            padx=18,
            pady=9,
            cursor="hand2",
        )
        self.settings_save_button.pack(side="right")
        tk.Label(
            body,
            text=f"Leytech Asistente {self.updates.version}",
            font=("Segoe UI", 8),
            fg=self.settings_colors["muted"],
            bg=self.settings_colors["background"],
        ).pack(anchor="center", pady=(12, 0))

        self._bind_settings_mousewheel(window, canvas)
        self._reveal_window(window)

    def _memory_action(self, action):
        parent = self.settings_window or self.root
        payload = {'type':action}
        if action == 'clear_memory':
            if not messagebox.askyesno('Formatear memoria','Se borrará todo el historial de chat. ¿Quieres continuar?',parent=parent):
                return
        elif action == 'memory_export':
            path = filedialog.asksaveasfilename(parent=parent,title='Exportar memoria',defaultextension='.json',filetypes=[('Memoria de Leytech','*.json')])
            if not path:
                return
            payload['path'] = path
        elif action == 'memory_import':
            path = filedialog.askopenfilename(parent=parent,title='Importar memoria',filetypes=[('Memoria de Leytech','*.json')])
            if not path:
                return
            if not messagebox.askyesno('Importar memoria','La memoria del archivo reemplazará el historial actual. ¿Quieres continuar?',parent=parent):
                return
            payload['path'] = path
        if self._send_payload(payload):
            self.memory_status.configure(text='Procesando memoria…')

    def _memory_updated(self, action, count=0):
        label = getattr(self,'memory_status',None)
        if label is not None and label.winfo_exists():
            text = 'Memoria formateada.' if action=='clear_memory' else f'Memoria {"exportada" if action=="memory_export" else "importada"}: {count} mensajes.'
            label.configure(text=text)
        if action=='memory_export':
            return
        self._memory_revision = getattr(self,'_memory_revision',0)+1
        revision = self._memory_revision
        self.chat_text.configure(state="normal")
        self.chat_text.delete("1.0", "end")
        self.chat_text.mark_set("chat_tail", "1.0")
        self.chat_text.configure(state="disabled")
        self._chat_pending_message = None
        self._chat_following = True
        self.chat_message_rows.clear()
        messages = load_chat_messages() if action=='memory_import' else []
        def render(offset=0):
            self._memory_render_id = None
            if self.closed or self._memory_revision!=revision:
                return
            for role,text in messages[offset:offset+30]:
                self._add_message('user' if role=='Usuario' else 'assistant',text)
            if offset+30<len(messages):
                self._memory_render_id = self.root.after(10,lambda:render(offset+30))
            else:
                self._schedule_chat_scroll_to_bottom()
        render()

    def _new_microphone_threshold_variable(self, value: Any) -> tk.IntVar:
        self.microphone_threshold_variable = tk.IntVar(value=int(value))
        return self.microphone_threshold_variable

    @staticmethod
    def _bind_settings_mousewheel(window: tk.Toplevel, canvas: tk.Canvas) -> None:
        def scroll(event: tk.Event) -> str:
            if getattr(event, "num", None) == 4:
                direction = -1
            elif getattr(event, "num", None) == 5:
                direction = 1
            else:
                delta = int(getattr(event, "delta", 0))
                if delta == 0:
                    return "break"
                direction = -1 if delta > 0 else 1
            canvas.yview_scroll(direction, "units")
            return "break"

        def bind_widget(widget: tk.Misc) -> None:
            # La rueda desplaza la página sin cambiar opciones.
            for sequence in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
                widget.bind(sequence, scroll, add="+")
            for child in widget.winfo_children():
                bind_widget(child)

        bind_widget(window)

    def _select_settings_section(self, title):
        for name, page in self._settings_pages.items():
            page.pack_forget()
            self._settings_nav[name].configure(
                bg=self.settings_colors["surface_light"] if name == title else self.settings_colors["surface"],
                font=("Segoe UI", 10, "bold" if name == title else "normal"))
        self._settings_pages[title].pack(fill="x")
        self._settings_canvas.yview_moveto(0)
        self.root.after_idle(
            lambda: self._settings_canvas.configure(scrollregion=self._settings_canvas.bbox("all"))
            if self._settings_canvas.winfo_exists() else None)

    def _build_support_page(self, parent, window):
        body = self._settings_section(parent, 'Soporte')
        scale = window.winfo_fpixels('1i') / 96
        size = 32 if scale <= 1.25 else 48 if scale <= 1.75 else 64
        try:
            icon = tk.PhotoImage(master=window, file=str(PROJECT_ROOT / 'frontend' / 'assets' / f'discord-button-{size}.png'))
        except (tk.TclError,OSError):
            icon = None
        window._discord_icon = icon
        def open_discord():
            try:
                if not webbrowser.open('https://discord.gg/xNkUcBKBV9'):
                    raise OSError()
            except (OSError, webbrowser.Error):
                messagebox.showerror('Discord','No pude abrir Discord. Revisa el navegador predeterminado.',parent=window)
        tk.Button(body, text='Únete a nuestro canal de Discord', image=icon or '', compound='left',
                  command=open_discord, font=('Segoe UI',10,'bold'), wraplength=340, fg='#ffffff', bg='#5865F2',
                  activeforeground='#ffffff', activebackground='#4752C4', relief='flat', bd=0,
                  padx=16, pady=12, cursor='hand2').pack(anchor='w',pady=10)

    def _settings_section(self, parent, title):
        outer = tk.Frame(parent, bg=self.settings_colors["surface"], highlightbackground=self.settings_colors["border"], highlightthickness=1)
        self._settings_pages[title] = outer
        button = SectionButton(self._settings_sidebar, text=title,
                           command=lambda: self._select_settings_section(title),
                           font=("Segoe UI", 10),
                           fg=self.settings_colors["text"], bg=self.settings_colors["surface"])
        button.pack(fill="x", padx=6, pady=2)
        self._settings_nav[title] = button
        tk.Label(outer, text=title, font=("Segoe UI", 13, "bold"), fg=self.settings_colors["text"],
                 bg=self.settings_colors["surface"], anchor="w", padx=12, pady=10).pack(fill="x")
        content = tk.Frame(outer, bg=self.settings_colors["background"], padx=12, pady=10)
        content.pack(fill="x")
        return content

    def _settings_heading(self, parent: tk.Widget, text: str) -> tk.Label:
        return tk.Label(
            parent,
            text=text,
            font=("Segoe UI", 11, "bold"),
            fg=self.settings_colors["text"],
            bg=self.settings_colors["background"],
            anchor="w",
            justify="left",
            wraplength=340,
        )

    def _settings_entry(self, parent: tk.Widget, label: str, show: str = "") -> tk.Entry:
        self._settings_heading(parent, label).pack(
            anchor="w", pady=(18, 7)
        )
        entry = tk.Entry(
            parent,
            font=("Segoe UI", 10),
            fg=self.settings_colors["text"],
            insertbackground=self.settings_colors["text"],
            bg=self.settings_colors["surface"],
            relief="flat",
            bd=0,
            show=show,
        )
        entry.pack(fill="x", ipady=9, padx=1)
        return entry

    def _save_settings(
        self,
        window: tk.Toplevel,
        api_key: tk.Entry,
        username: tk.Entry,
        wake_word: tk.Entry,
        speed: tk.DoubleVar,
        voice_volume: tk.IntVar,
        theme: ttk.Combobox,
        recognition_mode: ttk.Combobox,
        sensitivity: ttk.Combobox,
        manual_threshold: tk.Spinbox,
        dynamic_adjustment: tk.BooleanVar,
        sensitivity_labels: dict[str, str],
        chat_visibility: ttk.Combobox | None = None,
        ai_settings=None,
        startup_choice=None,
        voice_selection=None,
        shortcut_entries=None,
        english_music=None,
    ) -> None:
        if not wake_word.get().strip():
            messagebox.showwarning(
                "Palabra clave requerida",
                "Escribe una palabra clave para activar el asistente por voz.",
                parent=window,
            )
            return
        try:
            manual_threshold_value = int(manual_threshold.get())
        except ValueError:
            messagebox.showwarning(
                "Umbral no válido",
                "El umbral manual debe ser un número entero.",
                parent=window,
            )
            return
        if manual_threshold_value < 1 or manual_threshold_value > 32767:
            messagebox.showwarning(
                "Umbral no válido",
                "El umbral manual debe estar entre 1 y 32767.",
                parent=window,
            )
            return
        shortcuts = None
        if shortcut_entries is not None:
            try:
                shortcuts = self.hotkeys.validate_available({action: entry.get().strip() for action, entry in shortcut_entries.items()})
            except ValueError as error:
                messagebox.showerror("Atajo no disponible", str(error), parent=window)
                return
        previous_config = load_config()
        microphone_selection = self.microphone_combo.get() if self.microphone_combo is not None else ""
        microphone_device_index = self.microphone_options.get(
            microphone_selection,
            previous_config.get("microphone_device_index"),
        )
        config = previous_config.copy()
        if english_music is not None:
            config["recognition_english_music"] = english_music.get()
        if shortcuts is not None:
            config["hotkeys"] = shortcuts
        if voice_selection is not None:
            choice, options = voice_selection
            config["voice_id"] = options.get(choice.get(), "")
        if startup_choice is not None:
            config["startup_enabled"] = startup_choice.get() == "Sí"
        if chat_visibility is not None:
            config["show_chat_history"] = chat_visibility.get() == "Mostrar"
        config.update({
            "api_key": api_key.get().strip(),
            "username": username.get().strip(),
            "wake_word": wake_word.get().strip(),
            "voice_speed": normalize_voice_speed(speed.get()),
            "voice_volume": voice_volume.get(),
            "ui_theme": "dark" if theme.get() == "Oscuro" else "light",
            "voice_recognition_mode": "online" if recognition_mode.get() == "Online" else "offline",
            "microphone_device_index": microphone_device_index,
            "microphone_sensitivity": sensitivity_labels[sensitivity.get()],
            "microphone_manual_threshold": manual_threshold_value,
            "microphone_dynamic_adjustment": dynamic_adjustment.get(),
        })
        if ai_settings is not None:
            provider_widget, model_widget, drafts = ai_settings
            active = provider_widget.get().lower()
            drafts[active] = [api_key.get().strip(), model_widget.get().strip()]
            config.update(ai_provider=active, api_key=drafts["openai"][0],
                          openrouter_api_key=drafts["openrouter"][0],
                          openai_model=drafts["openai"][1] or "gpt-4o-mini",
                          openrouter_model=drafts["openrouter"][1] or "openrouter/free")
        try:
            configure_startup(bool(config.get("startup_enabled", False)))
            save_config(config)
        except (OSError, RuntimeError) as error:
            messagebox.showerror("No se pudo guardar", f"Error al guardar la configuración: {error}", parent=window)
            return
        if self._send_payload({"type": "settings", "config": config}, notify=False):
            if self.settings_save_button is not None and self.settings_save_button.winfo_exists():
                self.settings_save_button.configure(state="disabled", text="Guardando…")
        else:
            window.destroy()
            self.settings_window = None
            self._restart_application()

    def _reset_settings(self, window: tk.Toplevel) -> None:
        if not messagebox.askyesno(
            "Restablecer ajustes",
            "Se borrarán la API key y los ajustes guardados. ¿Quieres continuar?",
            parent=window,
        ):
            return
        config = DEFAULT_CONFIG.copy()
        try:
            configure_startup(bool(config.get("startup_enabled", False)))
            save_config(config)
        except (OSError, RuntimeError) as error:
            messagebox.showerror(
                "No se pudieron restablecer los ajustes",
                f"No se pudieron restablecer los ajustes: {error}",
                parent=window,
            )
            return
        if self._send_payload({"type": "settings", "config": config}, notify=False):
            if self.settings_save_button is not None and self.settings_save_button.winfo_exists():
                self.settings_save_button.configure(state="disabled", text="Restableciendo…")
        else:
            window.destroy()
            self.settings_window = None
            self._restart_application()

    def _export_config(self) -> None:
        if not messagebox.askyesno(
            "Exportar configuración",
            "El archivo exportado incluye tu API key. Guárdalo en un lugar seguro. ¿Continuar?",
            parent=self.settings_window,
        ):
            return
        path = filedialog.asksaveasfilename(
            parent=self.settings_window,
            title="Exportar configuración",
            defaultextension=".json",
            filetypes=(("Archivo JSON", "*.json"),),
            initialfile="computadora-config.json",
        )
        if not path:
            return
        try:
            Path(path).write_text(
                json.dumps(load_config(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as error:
            messagebox.showerror(
                "No se pudo exportar",
                f"No se pudo guardar la configuración: {error}",
                parent=self.settings_window,
            )

    def _import_config(self, window: tk.Toplevel) -> None:
        path = filedialog.askopenfilename(
            parent=window,
            title="Importar configuración",
            filetypes=(("Archivo JSON", "*.json"),),
        )
        if not path:
            return
        try:
            imported = json.loads(Path(path).read_text(encoding="utf-8"))
            if not isinstance(imported, dict):
                raise ValueError("El archivo debe contener un objeto JSON.")
            config = load_config()
            config.update(imported)
            config.pop("key_bindings", None)
            if not isinstance(config.get("wake_word"), str) or not config["wake_word"].strip():
                raise ValueError("La palabra clave debe ser un texto no vacío.")
            if not isinstance(config.get("api_key"), str) or not isinstance(config.get("username"), str):
                raise ValueError("La API key y el nombre de usuario deben ser texto.")
            if config.get("ai_provider") not in {"openai", "openrouter"}:
                raise ValueError("El proveedor de IA no es válido.")
            if any(not isinstance(config.get(field), str) for field in
                   ("openrouter_api_key", "openai_model", "openrouter_model")):
                raise ValueError("Las claves y los modelos de IA deben ser texto.")
            config["voice_speed"] = normalize_voice_speed(config.get("voice_speed", "normal"))
            if not isinstance(config.get("startup_enabled", False), bool):
                raise ValueError("La opción de inicio automático debe ser Sí o No.")
            voice_volume = config.get("voice_volume")
            if not isinstance(voice_volume, int) or isinstance(voice_volume, bool) or not 0 <= voice_volume <= 100:
                raise ValueError("El volumen de voz debe ser un número entre 0 y 100.")
            if config.get("ui_theme") not in {"light", "dark"}:
                raise ValueError("El tema visual no es válido.")
            if config.get("microphone_sensitivity") not in {
                "auto",
                "low",
                "normal",
                "high",
                "very_high",
                "manual",
            }:
                raise ValueError("El modo de sensibilidad del micrófono no es válido.")
            manual_threshold = config.get("microphone_manual_threshold")
            if (
                not isinstance(manual_threshold, int)
                or isinstance(manual_threshold, bool)
                or not 1 <= manual_threshold <= 32767
            ):
                raise ValueError("El umbral manual debe ser un entero entre 1 y 32767.")
            if not isinstance(config.get("microphone_dynamic_adjustment"), bool):
                raise ValueError("El ajuste dinámico del micrófono no es válido.")
            if not isinstance(config.get("microphone_enabled"), bool):
                raise ValueError("El estado del micrófono no es válido.")
            device_index = config.get("microphone_device_index")
            if device_index is not None and (not isinstance(device_index, int) or isinstance(device_index, bool)):
                raise ValueError("El índice del micrófono no es válido.")
            if not self.assistant_ready:
                raise ConnectionError("El asistente no está listo para aplicar la configuración.")
            if not isinstance(config.get("show_chat_history", True), bool):
                raise ValueError("La visibilidad del historial debe ser Mostrar u Ocultar (valor booleano).")
            config["hotkeys"] = self.hotkeys.validate_available(config.get("hotkeys", {}))
            previous_config = load_config()
            configure_startup(bool(config.get("startup_enabled", False)))
            save_config(config)
            if not self._send_payload({"type": "settings", "config": config}, notify=False):
                save_config(previous_config)
                raise ConnectionError("No se pudo aplicar la configuración del asistente.")
            messagebox.showinfo(
                "Configuración importada",
                "La configuración se aplicó. Computadora se reiniciará para completar los cambios.",
                parent=window,
            )
        except (OSError, RuntimeError, json.JSONDecodeError, TypeError, ValueError, ConnectionError) as error:
            messagebox.showerror(
                "No se pudo importar",
                f"El archivo no se pudo validar o aplicar: {error}",
                parent=window,
            )

    def _restart_application(self) -> None:
        if self._restart_started or self.closed:
            return
        self._restart_started = True
        if self._restart_after_id is not None:
            self.root.after_cancel(self._restart_after_id)
            self._restart_after_id = None
        self._finish_close()

    def _install_update(self, installer: Path) -> None:
        if self.closed or self.closing or self._shutdown_pending:
            return
        self.update_installer = installer
        self.closing = True
        self._finish_close()

    def close(self) -> None:
        if self.closing or self.closed:
            return
        self.closing = True
        if not self.assistant_ready or not self._send_payload({"type": "farewell"}, notify=False):
            self._finish_close()
            return
        self._schedule_close(5000)

    def _schedule_close(self, delay):
        if self.closed or self._shutdown_pending:
            return
        if self._close_after_id is not None:
            self.root.after_cancel(self._close_after_id)
        def finish():
            self._close_after_id = None
            self._finish_close()
        self._close_after_id = self.root.after(delay, finish)

    def _finish_close(self) -> None:
        if self.closed or self._shutdown_pending:
            return
        if self._close_after_id is not None:
            self.root.after_cancel(self._close_after_id)
            self._close_after_id = None
        self._shutdown_pending = True
        self.assistant_ready = False
        self.runtime.close()
        if not self.runtime.is_alive():
            self._complete_close()

    def _complete_close(self) -> None:
        if self.closed:
            return
        self.hotkeys.close()
        if self._restart_started:
            environment = os.environ.copy()
            environment["ASSISTANT_RESTART_DELAY"] = "1.5"
            environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
            # El nuevo proceso no debe mantener abierta la extracción anterior.
            restart_directory = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else PROJECT_ROOT
            options: dict[str, Any] = {
                "cwd": str(restart_directory),
                "env": environment,
                "stdin": subprocess.DEVNULL,
                "stdout": subprocess.DEVNULL,
                "stderr": subprocess.DEVNULL,
            }
            if sys.platform == "win32":
                options["creationflags"] = subprocess.CREATE_NO_WINDOW
            try:
                subprocess.Popen([sys.executable] if getattr(sys, "frozen", False) else [sys.executable, "-m", "frontend.gui"], **options)
            except OSError as error:
                self._restart_started = False
                messagebox.showerror(
                    "No se pudo reiniciar",
                    f"La configuración se guardó, pero no se pudo volver a abrir Computadora: {error}",
                    parent=self.root,
                )
                self._shutdown_pending = False
                self.hotkeys = GlobalHotkeys(load_config().get("hotkeys", {}))
                self.runtime = AssistantRuntime(self._receive_event)
                self.runtime.start()
                return
        self.closed = True
        self.music_notice.close()
        for name in ("_chat_layout_after_id", "_orb_after_id", "_restore_visual_after_id", "_memory_render_id", "_poll_after_id", "_close_after_id", "_restart_after_id"):
            callback = getattr(self, name, None)
            if callback is not None:
                try:
                    self.root.after_cancel(callback)
                except tk.TclError:
                    pass  # La tarea puede haber terminado o sido cancelada.
                setattr(self, name, None)
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    if '--verify-portable' in sys.argv:
        try:
            from backend.portable_check import verify_portable
            verify_portable()
        except Exception:
            raise SystemExit(1)
        raise SystemExit(0)
    if '--verify-resources' in sys.argv:
        from backend.installation_check import verify_resources
        raise SystemExit(1 if verify_resources() else 0)
    if '--verify-player' in sys.argv:
        # Comprobar el reproductor durante la compilación.
        try:
            from backend.music import load_vlc
            engine = load_vlc().Instance('--no-video', '--quiet', '--aout=dummy')
            if engine is None:
                raise RuntimeError('No se pudo iniciar el reproductor.')
            player = engine.media_player_new()
            if player is None:
                raise RuntimeError('No se pudo crear el reproductor.')
            player.release()
            engine.release()
        except BaseException:
            raise SystemExit(1)
        raise SystemExit(0)
    if not require_activation():
        return
    restart_delay = float(os.environ.pop("ASSISTANT_RESTART_DELAY", "0"))
    if restart_delay > 0:
        time.sleep(restart_delay)
    assistant = AssistantWindow()
    assistant.run()
    if assistant.update_installer is not None:
        try:
            os.startfile(assistant.update_installer)
        except OSError:
            messagebox.showerror(
                "No se pudo abrir el instalador",
                "Abre el asistente y vuelve a intentar, o descarga la actualización desde la tienda.",
            )


if __name__ == "__main__":
    main()
