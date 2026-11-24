"""Atajos globales de Windows sin interceptar el teclado del usuario."""
import ctypes
from ctypes import wintypes
import queue
import sys
import threading

DEFAULT_HOTKEYS = {
    'toggle_window': 'Ctrl+Alt+L', 'toggle_music': 'Ctrl+Alt+P',
    'seek_back': 'Ctrl+Alt+Left', 'seek_forward': 'Ctrl+Alt+Right',
    'previous': 'Ctrl+Alt+B', 'next': 'Ctrl+Alt+N',
}
HOTKEY_LABELS = {
    'toggle_window': 'Mostrar / minimizar el asistente',
    'toggle_music': 'Pausar / reanudar la canción',
    'seek_back': 'Retroceder 10 segundos', 'seek_forward': 'Adelantar 10 segundos',
    'previous': 'Canción anterior', 'next': 'Canción siguiente',
}


MEDIA_VIRTUAL_KEYS = {
    'MediaPlayPause': 0xB3, 'MediaStop': 0xB2, 'MediaNextTrack': 0xB0,
    'MediaPreviousTrack': 0xB1, 'VolumeMute': 0xAD, 'VolumeDown': 0xAE, 'VolumeUp': 0xAF,
}
MEDIA_KEY_ALIASES = {}
for canonical, aliases in {
    'MediaPlayPause': ('AudioPlay', 'AudioPause', 'AudioPlayPause', 'MediaPlay', 'MediaPause',
                       'XF86AudioPlay', 'XF86AudioPause', 'XF86AudioPlayPause'),
    'MediaStop': ('AudioStop', 'XF86AudioStop'),
    'MediaNextTrack': ('AudioNext', 'MediaNext', 'XF86AudioNext'),
    'MediaPreviousTrack': ('AudioPrev', 'AudioPrevious', 'MediaPrev', 'XF86AudioPrev'),
    'VolumeMute': ('AudioMute', 'XF86AudioMute'),
    'VolumeDown': ('AudioLowerVolume', 'XF86AudioLowerVolume'),
    'VolumeUp': ('AudioRaiseVolume', 'XF86AudioRaiseVolume'),
}.items():
    for alias in (canonical, *aliases):
        MEDIA_KEY_ALIASES[alias.upper()] = canonical


def parse_shortcut(value):
    if value == 'Desactivado':
        return None
    if not isinstance(value, str):
        raise ValueError('El atajo debe ser una combinación de teclas.')
    parts = value.upper().split('+')
    modifiers = {'CTRL': 2, 'ALT': 1, 'SHIFT': 4}
    if not parts or len(parts[:-1]) != len(set(parts[:-1])) or any(p not in modifiers for p in parts[:-1]):
        raise ValueError('Usa Ctrl, Alt o Shift y una tecla; por ejemplo Ctrl+Alt+L.')
    mod = sum(modifiers[p] for p in parts[:-1])
    key = MEDIA_KEY_ALIASES.get(parts[-1], parts[-1]).upper()
    keys = {'LEFT': 0x25, 'RIGHT': 0x27, 'UP': 0x26, 'DOWN': 0x28, 'SPACE': 0x20, 'ENTER': 0x0D, 'ESCAPE': 0x1B, 'TAB': 9,
            'BACKSPACE': 8, 'DELETE': 0x2E, 'INSERT': 0x2D, 'HOME': 0x24,
            'END': 0x23, 'PAGEUP': 0x21, 'PAGEDOWN': 0x22}
    keys.update({name.upper(): code for name, code in MEDIA_VIRTUAL_KEYS.items()})
    keys.update({f'F{i}': 0x6F + i for i in range(1, 25)})
    if len(key) == 1 and key.isascii() and key.isalnum():
        return mod, ord(key)
    if key in keys:
        return mod, keys[key]
    raise ValueError('Usa una letra, número, tecla de función, flecha o tecla multimedia compatible.')


def validate_bindings(bindings):
    if not isinstance(bindings, dict):
        raise ValueError('La configuración de atajos no es válida.')
    result = DEFAULT_HOTKEYS.copy()
    result.update({k: v for k, v in bindings.items() if k in result})
    used = set()
    for action, value in result.items():
        shortcut = parse_shortcut(value)
        if shortcut is not None:
            if shortcut in used:
                raise ValueError('Hay dos acciones con el mismo atajo.')
            used.add(shortcut)
    return result


class GlobalHotkeys:
    def __init__(self, bindings):
        self.events = queue.SimpleQueue()
        self.errors = []
        self._requests = queue.Queue()
        self._stop = threading.Event()
        self._ready = threading.Event()
        self._bindings = validate_bindings(bindings)
        self._thread = threading.Thread(target=self._run, daemon=True, name='LeytechHotkeys')
        self._thread.start()

    def validate_available(self, bindings):
        bindings = validate_bindings(bindings)
        if sys.platform != 'win32':
            return bindings
        ready, result = threading.Event(), []
        self._requests.put((bindings, ready, result))
        if not ready.wait(1):
            raise ValueError('No pude comprobar los atajos. Inténtalo otra vez.')
        if result:
            raise ValueError(result[0])
        return bindings

    def suspend(self, enabled):
        if self._stop.is_set() or sys.platform != 'win32':
            return
        ready = threading.Event()
        self._requests.put(('suspend' if enabled else 'resume', ready, []))
        ready.wait(.25)
        if enabled:
            while not self.events.empty():
                self.events.get_nowait()

    def _run(self):
        if sys.platform != 'win32':
            self._ready.set()
            return
        user = ctypes.WinDLL('user32', use_last_error=True)
        user.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
        user.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
        user.PeekMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]
        self.thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        owned, actions = set(), {}
        message = wintypes.MSG()
        user.PeekMessageW(ctypes.byref(message), None, 0, 0, 0)
        try:
            for index, (action, value) in enumerate(self._bindings.items(), 1):
                shortcut = parse_shortcut(value)
                if shortcut:
                    mod, key = shortcut
                    if user.RegisterHotKey(None, index, mod | 0x4000, key):
                        owned.add(shortcut)
                        actions[index] = action
                    else:
                        reason = 'Windows no permitió registrar este atajo' if ctypes.get_last_error() == 5 else 'atajo ocupado o reservado'
                        self.errors.append(f'{value}: {reason}. Revisa Ajustes → Atajos de teclado.')
            self._ready.set()
            while not self._stop.is_set():
                while user.PeekMessageW(ctypes.byref(message), None, 0x0312, 0x0312, 1):
                    action = actions.get(message.wParam)
                    if action:
                        self.events.put(action)
                try:
                    bindings, ready, result = self._requests.get_nowait()
                except queue.Empty:
                    self._stop.wait(.015)
                    continue
                if isinstance(bindings, str):
                    if bindings == 'suspend':
                        for index in actions:
                            user.UnregisterHotKey(None, index)
                        actions.clear()
                        owned.clear()
                    elif not actions:
                        self.errors.clear()
                        for index, (action, value) in enumerate(self._bindings.items(), 1):
                            shortcut = parse_shortcut(value)
                            if shortcut and user.RegisterHotKey(None, index, shortcut[0] | 0x4000, shortcut[1]):
                                actions[index] = action
                                owned.add(shortcut)
                            elif shortcut:
                                self.errors.append(f'{value}: no disponible. Revisa los atajos.')
                    ready.set()
                    continue
                for value in bindings.values():
                    shortcut = parse_shortcut(value)
                    if shortcut and shortcut not in owned:
                        if user.RegisterHotKey(None, 100, shortcut[0] | 0x4000, shortcut[1]):
                            user.UnregisterHotKey(None, 100)
                        else:
                            reason = 'Windows no permitió registrar el atajo' if ctypes.get_last_error() == 5 else 'El atajo está ocupado o reservado'
                            result.append(f'{value}: {reason}. Elige otro atajo o revisa los permisos de ejecución.')
                            break
                ready.set()
        finally:
            for index in actions:
                user.UnregisterHotKey(None, index)
            self._ready.set()

    def close(self):
        self._stop.set()
        self._thread.join(timeout=1)
