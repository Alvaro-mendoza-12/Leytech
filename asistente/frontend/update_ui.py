import os
import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk
from typing import Callable

import httpx

from backend.paths import IS_PORTABLE
from backend.updates import PUBLIC_KEY_PATH, Release, check_update, clear_previous_installers, current_version, download_update


class UpdateControls:
    def __init__(self, root: tk.Tk, install: Callable[[Path], None]) -> None:
        self.root = root
        self.install = install
        self.status = tk.StringVar(root)
        self.busy = tk.BooleanVar(root, False)
        self.version = current_version()
        self.enabled = PUBLIC_KEY_PATH.is_file() and not IS_PORTABLE
        self.announced = None
        if self.enabled:
            self.status.set("Puedes buscar actualizaciones ahora.")
            self.root.after(4500, self.automatic_check)
        elif IS_PORTABLE:
            self.status.set("Para actualizar la versión portable, reemplaza el ejecutable por la nueva versión de Leytech.")
        else:
            self.status.set("Instala la versión de la tienda para recibir actualizaciones.")

    def automatic_check(self) -> None:
        if not self.busy.get():
            self.check(manual=False)
        self.root.after(6 * 60 * 60 * 1000, self.automatic_check)

    def add_to(self, parent: tk.Widget, settings: tk.Toplevel, colors: dict[str, str]) -> None:
        label_style = {"bg": colors["background"], "fg": colors["text"], "anchor": "w"}
        tk.Label(parent, text=f"Versión instalada {self.version}", **label_style).pack(anchor="w")
        tk.Label(parent, textvariable=self.status, wraplength=400, justify="left",
                 **label_style).pack(anchor="w", pady=(4, 10))
        button = ttk.Button(parent, text="Buscar actualizaciones",
                            command=lambda: self.check(parent=settings))
        button.pack(anchor="w")

        def sync(*_args) -> None:
            button.configure(state="normal" if self.enabled and not self.busy.get() else "disabled")

        sync()
        trace = self.busy.trace_add("write", sync)
        button.bind("<Destroy>", lambda _event: self.busy.trace_remove("write", trace))
        if IS_PORTABLE:
            return
        ttk.Button(parent, text="Abrir aplicaciones instaladas de Windows",
                   command=lambda: self.open_windows_apps(settings)).pack(anchor="w", pady=(18, 4))
        tk.Label(parent, text="Desde Windows puedes desinstalar Leytech Asistente.",
                 wraplength=400, **label_style).pack(anchor="w", pady=(0, 12))

    def open_windows_apps(self, parent: tk.Toplevel) -> None:
        try:
            os.startfile("ms-settings:appsfeatures")
        except OSError:
            messagebox.showinfo("Aplicaciones instaladas",
                                "Abre Configuración de Windows y selecciona Aplicaciones.", parent=parent)

    def check(self, manual: bool = True, parent: tk.Toplevel | None = None) -> None:
        if self.busy.get() or not self.enabled:
            return
        self.busy.set(True)
        if manual:
            self.status.set("Buscando actualizaciones…")
        result: queue.SimpleQueue = queue.SimpleQueue()

        def lookup() -> None:
            try:
                clear_previous_installers()
                result.put(check_update())
            except (httpx.HTTPError, KeyError, OSError, TypeError, ValueError):
                result.put(False)

        def received() -> None:
            try:
                release = result.get_nowait()
            except queue.Empty:
                self.root.after(100, received)
                return
            self.busy.set(False)
            if release is False:
                if manual:
                    self.status.set("No se pudo buscar ahora. Revisa tu conexión e inténtalo de nuevo.")
                return
            if release is None:
                self.status.set("Tienes la última versión.")
                return
            self.status.set(f"Disponible la versión {release.version}.")
            if not manual and self.announced == release.version:
                return
            self.announced = release.version
            owner = parent if parent is not None and parent.winfo_exists() else self.root
            if messagebox.askyesno(
                "Actualización disponible",
                f"Leytech Asistente {release.version} está disponible.\n\n"
                "Al terminar la descarga, el asistente se cerrará para abrir el instalador. ¿Quieres actualizar ahora?",
                parent=owner,
            ):
                self.download(release)

        threading.Thread(target=lookup, daemon=True).start()
        self.root.after(100, received)

    def download(self, release: Release) -> None:
        self.busy.set(True)
        self.status.set("Descargando actualización…")
        result: queue.SimpleQueue = queue.SimpleQueue()
        dialog = tk.Toplevel(self.root)
        dialog.title("Actualizando Leytech Asistente")
        dialog.resizable(False, False)
        dialog.transient(self.root)
        dialog.protocol("WM_DELETE_WINDOW", lambda: None)
        label = ttk.Label(dialog, text="Descargando actualización…", padding=(18, 18))
        label.pack()
        bar = ttk.Progressbar(dialog, length=300)
        bar.pack(padx=18, pady=(0, 18))

        def retrieve() -> None:
            try:
                result.put(download_update(release, result.put))
            except (httpx.HTTPError, OSError, ValueError):
                result.put(None)

        def received() -> None:
            try:
                while True:
                    outcome = result.get_nowait()
                    if type(outcome) is int:
                        bar.configure(value=outcome)
                        continue
                    dialog.destroy()
                    self.busy.set(False)
                    if outcome is None:
                        self.status.set("No se pudo descargar la actualización. Inténtalo de nuevo.")
                        messagebox.showerror("No se pudo actualizar", self.status.get(), parent=self.root)
                    else:
                        self.install(outcome)
                    return
            except queue.Empty:
                self.root.after(100, received)

        threading.Thread(target=retrieve, daemon=True).start()
        self.root.after(100, received)
