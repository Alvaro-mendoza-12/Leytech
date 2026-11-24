"""Permitir clics en una superposición sin activar su ventana de Windows."""
import ctypes
from ctypes import wintypes
import sys


class NoActivateWindow:
    def __init__(self, window, taskbar=False):
        self.window = window
        self.enabled = False
        self.taskbar = taskbar
        self._old_proc = None
        if sys.platform != 'win32':
            return
        user = self._user = ctypes.WinDLL('user32', use_last_error=True)
        user.GetParent.argtypes = [wintypes.HWND]
        user.GetParent.restype = wintypes.HWND
        self.hwnd = user.GetParent(window.winfo_id()) or window.winfo_id()
        self._get = user.GetWindowLongPtrW
        self._set = user.SetWindowLongPtrW
        self._get.argtypes = [wintypes.HWND, ctypes.c_int]
        self._get.restype = ctypes.c_ssize_t
        self._set.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
        self._set.restype = ctypes.c_ssize_t
        self._call = user.CallWindowProcW
        self._call.argtypes = [ctypes.c_void_p, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
        self._call.restype = ctypes.c_ssize_t
        callback_type = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
        self._callback = callback_type(self._dispatch)
        self._old_proc = self._set(self.hwnd, -4, ctypes.cast(self._callback, ctypes.c_void_p).value)
        if not self._old_proc:
            raise ctypes.WinError(ctypes.get_last_error())
        window.bind('<Destroy>', self._destroy, add='+')

    def _dispatch(self, hwnd, message, wparam, lparam):
        if self.enabled and message == 0x21:  # WM_MOUSEACTIVATE
            return 3  # MA_NOACTIVATE: conservar el clic y el foco anterior.
        return self._call(self._old_proc, hwnd, message, wparam, lparam)

    def set_enabled(self, enabled):
        self.enabled = enabled
        if sys.platform == 'win32' and self._old_proc:
            style = self._get(self.hwnd, -20)
            style = style | 0x08000000 if enabled else style & ~0x08000000
            if self.taskbar:
                style = (style | 0x40000) & ~0x80
            self._set(self.hwnd, -20, style)

    def _destroy(self, event):
        if event.widget is self.window:
            self.close()

    def close(self):
        if self._old_proc:
            self.set_enabled(False)
            self._set(self.hwnd, -4, self._old_proc)
            self._old_proc = None
