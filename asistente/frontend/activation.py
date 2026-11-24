import queue
import sqlite3
import threading
import tkinter as tk
from tkinter import messagebox, ttk

from backend.licensing import LICENSE_PATH, device_code, read_public_key, redeem, verify_receipt
from frontend.branding import set_window_icon


def require_activation() -> bool:
    try:
        device = device_code()
        public_key = read_public_key()
    except (OSError, TypeError, ValueError):
        root = tk.Tk()
        root.withdraw()
        set_window_icon(root)
        messagebox.showerror(
            "Leytech Asistente",
            "No se pudo preparar la activación. Vuelve a descargar el instalador o contacta a Leytech.",
            parent=root,
        )
        root.destroy()
        return False

    try:
        verify_receipt(LICENSE_PATH.read_text(encoding="ascii"), device, public_key)
        return True
    except (OSError, ValueError):
        pass

    root = tk.Tk()
    root.withdraw()
    root.title("Activar Leytech Asistente")
    set_window_icon(root)
    root.resizable(False, False)
    frame = ttk.Frame(root, padding=24)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Activa tu asistente", font=("Segoe UI", 16, "bold")).pack(anchor="w")
    ttk.Label(frame, text="Pega el código que recibiste por WhatsApp.").pack(anchor="w", pady=(12, 6))
    entry = ttk.Entry(frame, width=44)
    entry.pack(fill="x")
    status = tk.StringVar()
    ttk.Label(frame, textvariable=status, wraplength=335).pack(anchor="w", pady=(8, 8))
    activated = False
    results: queue.SimpleQueue[str | None] = queue.SimpleQueue()

    def request(code: str) -> None:
        try:
            redeem(code, device, public_key)
        except ValueError as error:
            results.put(str(error))
        except (OSError, sqlite3.Error):
            results.put("Windows no pudo guardar la activación. Inténtalo de nuevo.")
        else:
            results.put(None)

    def completed() -> None:
        nonlocal activated
        try:
            error = results.get_nowait()
        except queue.Empty:
            root.after(80, completed)
            return
        if error is None:
            activated = True
            root.destroy()
            return
        status.set(error)
        button.state(["!disabled"])
        entry.state(["!disabled"])
        entry.focus_set()

    def activate(_event=None) -> None:
        if button.instate(["disabled"]):
            return
        code = entry.get().strip()
        if not code:
            status.set("Pega tu código para continuar.")
            return
        button.state(["disabled"])
        entry.state(["disabled"])
        status.set("Activando…")
        threading.Thread(target=request, args=(code,), daemon=True).start()
        root.after(80, completed)

    button = ttk.Button(frame, text="Activar", command=activate)
    button.pack(anchor="e")
    root.bind("<Return>", activate)
    entry.focus_set()
    root.update_idletasks()
    root.deiconify()
    root.mainloop()
    return activated
