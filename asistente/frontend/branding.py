from tkinter import TclError, Tk
import ctypes
from ctypes import wintypes
import sys

from backend.paths import PROJECT_ROOT


def set_window_icon(window: Tk, theme="light") -> None:
    try:
        filename = 'leytech-dark.ico' if theme == 'dark' else 'leytech.ico'
        path = str(PROJECT_ROOT / 'frontend' / 'assets' / filename)
        if sys.platform != 'win32':
            window.iconbitmap(path)
            return
        user32 = ctypes.windll.user32
        user32.GetParent.argtypes = [wintypes.HWND]
        user32.GetParent.restype = wintypes.HWND
        hwnd = user32.GetParent(window.winfo_id())
        if getattr(window, '_icon_key', None) == (hwnd,path):
            return
        window.iconbitmap(path)
        user32.LoadImageW.argtypes = [wintypes.HINSTANCE,wintypes.LPCWSTR,wintypes.UINT,ctypes.c_int,ctypes.c_int,wintypes.UINT]
        user32.LoadImageW.restype = wintypes.HANDLE
        user32.SendMessageW.argtypes = [wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]
        user32.SendMessageW.restype = wintypes.LPARAM
        user32.DestroyIcon.argtypes = [wintypes.HICON]
        handles = []
        for kind,size in ((0,16),(1,32)):
            icon = user32.LoadImageW(None,path,1,size,size,0x10)
            if icon:
                user32.SendMessageW(hwnd,0x80,kind,icon)
                handles.append(icon)
        window._icon_key = (hwnd,path)
        window._native_icon_handles = handles
        def cleanup(event):
            if event.widget is window:
                for handle in handles:
                    user32.DestroyIcon(handle)
                handles.clear()
        window.bind('<Destroy>',cleanup,add='+')
    except (TclError,OSError,AttributeError):
        pass
