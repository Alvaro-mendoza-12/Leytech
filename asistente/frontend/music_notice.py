"""Avisos de música y respuestas, sin activar la ventana principal."""
from collections import deque
import ctypes
from ctypes import wintypes
import sys
import time
import tkinter as tk
from tkinter import font as tkfont


def fit_title(text, measure, width, max_lines=3):
    words = str(text).split()
    lines, current = [], ''
    index = 0
    while index < len(words) and len(lines) < max_lines:
        word = words[index]
        candidate = current + (' ' if current else '') + word
        if measure(candidate) <= width:
            current = candidate
            index += 1
        elif current:
            lines.append(current)
            current = ''
        else:
            # Solo cortar dentro de una palabra si ella sola supera el ancho.
            low, high = 0, len(word)
            while low < high:
                middle = (low + high + 1) // 2
                if measure(word[:middle] + '…') <= width:
                    low = middle
                else:
                    high = middle - 1
            current = word[:low] + '…'
            index = len(words)
    if current and len(lines) < max_lines:
        lines.append(current)
    if index < len(words) and lines:
        last = lines[-1].split()
        while last and measure(' '.join(last) + '…') > width:
            last.pop()
        lines[-1] = ' '.join(last).rstrip('.,;:') + '…'
    return '\n'.join(lines)


class MusicNotice:
    def __init__(self, root, colors, icon_factory):
        self.root = root
        self.colors = colors
        self.icon_factory = icon_factory
        self.window = None
        self._jobs = set()
        self._track = None
        self._closed = False
        self._exiting = False
        self._pending = deque()
        self._response_active = False

    def observe(self, state, minimized):
        status = state.get('status', 'idle')
        title = str(state.get('title') or '').strip()
        if status in ('idle', 'loading', 'error', 'ended'):
            self._track = None
            if not self._response_active:
                self.dismiss()
        elif status == 'playing' and title and title != self._track:
            self._track = title
            if minimized:
                if self._response_active:
                    self._pending.append(title)
                else:
                    self.show(title)
        if not minimized:
            self.dismiss()

    def notify(self, text):
        normalized = ' '.join(str(text).casefold().split())
        if normalized.rstrip('.…!? ') in ('buscando la canción', 'buscando la cancion') or normalized.startswith(('buscando la canción:', 'buscando la cancion:')):
            return
        if self._closed or not str(text).strip() or self.root.state() != 'iconic':
            return
        self._pending.append(str(text))
        self._next_response()

    def _next_response(self):
        if self._closed or self.root.state() != 'iconic':
            self._pending.clear()
            return
        if not self._response_active and self._pending:
            self.show(self._pending.popleft(), response=True)

    def _later(self, delay, callback):
        def run():
            self._jobs.discard(job)
            if not self._closed:
                callback()
        job = self.root.after(delay, run)
        self._jobs.add(job)

    def _build(self):
        window = self.window = tk.Toplevel(self.root, takefocus=False)
        window.withdraw()
        window.overrideredirect(True)
        window.attributes('-topmost', True)
        colors = self.colors
        window.configure(bg=colors['border'])
        body = self.body = tk.Frame(window, bg=colors['surface'], padx=14, pady=12)
        body.pack(fill='both', expand=True, padx=1, pady=1)
        header = tk.Frame(body, bg=colors['surface'])
        header.pack(fill='x')
        self.icon = self.icon_factory()
        if self.icon:
            tk.Label(header, image=self.icon, bg=colors['surface']).pack(side='left', padx=(0, 9))
        tk.Label(header, text='Leytech Asistente', font=('Segoe UI', 10, 'bold'),
                 fg=colors['text'], bg=colors['surface']).pack(side='left')
        self.title_font = tkfont.Font(root=self.root, family='Segoe UI', size=10)
        self.title_label = tk.Label(body, font=self.title_font, justify='left', anchor='nw',
                                    padx=0, pady=0, borderwidth=0,
                                    fg=colors['text'], bg=colors['surface'])
        self.title_label.pack(fill='x', pady=(7, 0))
        window.update_idletasks()
        if sys.platform == 'win32':
            user = ctypes.windll.user32
            user.GetParent.argtypes = [wintypes.HWND]
            user.GetParent.restype = wintypes.HWND
            self._hwnd = user.GetParent(window.winfo_id()) or window.winfo_id()
            get_style = user.GetWindowLongPtrW
            set_style = user.SetWindowLongPtrW
            get_style.argtypes = [wintypes.HWND, ctypes.c_int]
            get_style.restype = ctypes.c_ssize_t
            set_style.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
            set_style.restype = ctypes.c_ssize_t
            # Sin foco, sin botón en la barra de tareas y sin capturar clics.
            style = (get_style(self._hwnd, -20) | 0x08000000 | 0x80 | 0x20) & ~0x40000
            set_style(self._hwnd, -20, style)

    def show(self, title, response=False):
        if self._closed:
            return
        self.hide()
        self._response_active = response
        try:
            if self.window is None:
                self._build()
            left, top, right = 0, 0, self.root.winfo_screenwidth()
            if sys.platform == 'win32':
                area = wintypes.RECT()
                if ctypes.windll.user32.SystemParametersInfoW(48, 0, ctypes.byref(area), 0):
                    left, top, right = area.left, area.top, area.right
            width = min(320, right - left - 32)
            self.title_label.configure(text=fit_title(title, self.title_font.measure, width - 32))
            self.window.update_idletasks()
            height = self.body.winfo_reqheight() + 2
            target_x, y = left + 16, top + 16
            self._bounds = (target_x, y, width, height)
            self.window.geometry(f'{width}x{height}+{target_x}+{y}')
            self.window.deiconify()
            if sys.platform == 'win32':
                ctypes.windll.user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
                ctypes.windll.user32.ShowWindow(self._hwnd, 4)
            started = time.monotonic()

            def slide():
                progress = min(1, (time.monotonic() - started) / .24)
                x = target_x - round(56 * (1 - progress) ** 3)
                self._move(x, y, width, height)
                if progress < 1:
                    self._later(16, slide)
            slide()
            self._later(6000, self.dismiss)
        except (tk.TclError, OSError, AttributeError):
            self.hide()
            self._response_active = False

    def _move(self, x, y, width, height):
        self._x = x
        if sys.platform == 'win32':
            user = ctypes.windll.user32
            user.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int,
                                         ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
            user.SetWindowPos(self._hwnd, -1, x, y, width, height, 0x10)
        else:
            self.window.geometry(f'{width}x{height}{x:+d}{y:+d}')

    def dismiss(self):
        if self._closed or self._exiting or self.window is None or not self.window.winfo_viewable():
            return
        self._cancel_jobs()
        self._exiting = True
        target_x, y, width, height = self._bounds
        start_x = getattr(self, '_x', target_x)
        end_x = target_x - width - 32
        started = time.monotonic()

        def slide_out():
            progress = min(1, (time.monotonic() - started) / .24)
            self._move(round(start_x + (end_x - start_x) * progress ** 2), y, width, height)
            if progress < 1:
                self._later(16, slide_out)
            else:
                self.hide()
                self._response_active = False
                self._next_response()
        slide_out()

    def _cancel_jobs(self):
        for job in self._jobs:
            try:
                self.root.after_cancel(job)
            except tk.TclError:
                pass
        self._jobs.clear()

    def hide(self):
        self._cancel_jobs()
        self._exiting = False
        if self.window is not None:
            try:
                self.window.withdraw()
            except tk.TclError:
                pass

    def close(self):
        self._pending.clear()
        self.hide()
        self._closed = True
        if self.window is not None:
            self.window.destroy()
            self.window = None
