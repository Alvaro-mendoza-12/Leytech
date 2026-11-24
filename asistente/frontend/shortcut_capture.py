"""Campo que captura una tecla o combinación sin escribir texto libre."""
import tkinter as tk
import sys
import ctypes
from backend.hotkeys import MEDIA_KEY_ALIASES, MEDIA_VIRTUAL_KEYS

KEY_NAMES = {
    'Return': 'Enter', 'KP_Enter': 'Enter', 'space': 'Space', 'Escape': 'Escape',
    'BackSpace': 'Backspace', 'Prior': 'PageUp', 'Next': 'PageDown',
}
MODIFIERS = {'Control_L': 'Ctrl', 'Control_R': 'Ctrl', 'Alt_L': 'Alt',
             'Alt_R': 'Alt', 'Shift_L': 'Shift', 'Shift_R': 'Shift'}


def captured_shortcut(keysym, state, pressed, keycode=None):
    if keysym in MODIFIERS:
        return None
    mods = set(pressed)
    if state & 4:
        mods.add('Ctrl')
    if state & (0x20000 if sys.platform == "win32" else 8):
        mods.add('Alt')
    if state & 1:
        mods.add('Shift')
    media_key = next((name for name, code in MEDIA_VIRTUAL_KEYS.items() if code == keycode), None)
    key = media_key or MEDIA_KEY_ALIASES.get(keysym.upper()) or KEY_NAMES.get(keysym, keysym.upper() if len(keysym) == 1 else keysym)
    return '+'.join([m for m in ('Ctrl', 'Alt', 'Shift') if m in mods] + [key])


class ShortcutCapture(tk.Entry):
    def __init__(self, parent, value, on_capture=None, **kwargs):
        super().__init__(parent, state='readonly', takefocus=True, cursor='hand2', **kwargs)
        self._value = value
        self._on_capture = on_capture
        self._pressed = set()
        self._capturing = False
        self._render(value)
        self.bind('<FocusIn>', self._begin)
        self.bind('<Button-1>', self._click)
        self.bind('<FocusOut>', self._end)
        self.bind('<KeyPress>', self._press)
        self.bind('<KeyRelease>', self._release)

    def _render(self, text):
        self.configure(state='normal')
        self.delete(0, 'end')
        self.insert(0, text)
        self.configure(state='readonly')

    def get(self):
        return self._value

    def set(self, value):
        self._value = value
        self._render(value)

    def _begin(self, event=None):
        if not self._capturing and self._on_capture:
            self._on_capture(True)
        self._pressed.clear()
        self._capturing = True
        self._render('ingresa cualquier tecla')

    def _click(self, event):
        self.focus_set()
        self._begin()
        return 'break'

    def _end(self, event=None):
        if self._capturing and self._on_capture:
            self._on_capture(False)
        self._capturing = False
        self._pressed.clear()
        self._render(self._value)

    def _press(self, event):
        if not self._capturing:
            self._begin()
        if event.keysym in MODIFIERS:
            self._pressed.add(MODIFIERS[event.keysym])
            self._render('+'.join(m for m in ('Ctrl', 'Alt', 'Shift') if m in self._pressed) + '+…')
        else:
            pressed = self._pressed
            state = event.state
            if sys.platform == "win32":
                # Consultar teclas físicas: Fn y Num Lock no son Alt.
                down = ctypes.windll.user32.GetAsyncKeyState
                down.argtypes = [ctypes.c_int]
                down.restype = ctypes.c_short
                pressed = {name for name, code in (("Ctrl", 0x11), ("Alt", 0x12), ("Shift", 0x10)) if down(code) & 0x8000}
                state = 0
            self._value = captured_shortcut(event.keysym, state, pressed, getattr(event, "keycode", None))
            self._render(self._value)
        return 'break'

    def _release(self, event):
        self._pressed.discard(MODIFIERS.get(event.keysym))
        return 'break'
