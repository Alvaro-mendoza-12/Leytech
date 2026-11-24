import ctypes
import sys
import os
import queue
import threading
from contextlib import contextmanager
from typing import Iterator

import comtypes

from .logger import logger

try:
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
except ImportError:  # pragma: no cover
    AudioUtilities = None
    IAudioEndpointVolume = None

VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_PLAY_PAUSE = 0xB3
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_EXTENDEDKEY = 0x0001
CLSCTX_ALL = 0x17


class AudioController:
    @contextmanager
    def _endpoint_volume(self) -> Iterator[object]:
        if AudioUtilities is None or IAudioEndpointVolume is None:
            raise RuntimeError("El control de volumen de Windows no está disponible.")
        initialized_com = sys.platform == "win32"
        if initialized_com:
            comtypes.CoInitialize()
        try:
            speaker = AudioUtilities.GetSpeakers()
            volume = speaker.Activate(
                IAudioEndpointVolume._iid_,
                CLSCTX_ALL,
                None,
            ).QueryInterface(IAudioEndpointVolume)
            yield volume
        except Exception as error:
            logger.exception("No fue posible acceder al volumen del dispositivo de salida.")
            raise RuntimeError("No se pudo acceder al volumen del dispositivo de salida de Windows.") from error
        finally:
            if initialized_com:
                comtypes.CoUninitialize()

    @staticmethod
    def _clamp(value: int) -> int:
        return max(0, min(100, int(value)))

    def get_volume(self) -> int:
        with self._endpoint_volume() as endpoint:
            return self._clamp(round(endpoint.GetMasterVolumeLevelScalar() * 100))

    def set_volume(self, value: int) -> int:
        normalized = self._clamp(value)
        with self._endpoint_volume() as endpoint:
            endpoint.SetMasterVolumeLevelScalar(normalized / 100.0, None)
            return self._clamp(round(endpoint.GetMasterVolumeLevelScalar() * 100))

    def increase_volume(self, amount: int = 10) -> int:
        return self.set_volume(self.get_volume() + amount)

    def decrease_volume(self, amount: int = 10) -> int:
        return self.set_volume(self.get_volume() - amount)

    def mute(self, enabled: bool = True) -> bool:
        with self._endpoint_volume() as endpoint:
            endpoint.SetMute(enabled, None)
            return bool(endpoint.GetMute())

    def unmute(self) -> bool:
        return self.mute(False)

    def pause(self) -> None:
        """Send a one-way Pause, never the toggle that could resume audio."""
        if sys.platform != "win32":
            raise RuntimeError("La pausa multimedia solo está disponible en Windows.")
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        user32.GetForegroundWindow.restype = wintypes.HWND
        user32.SendMessageTimeoutW.argtypes = [wintypes.HWND, wintypes.UINT,
            wintypes.WPARAM, wintypes.LPARAM, wintypes.UINT, wintypes.UINT,
            ctypes.POINTER(ctypes.c_size_t)]
        user32.SendMessageTimeoutW.restype = wintypes.LPARAM
        hwnd = user32.GetForegroundWindow()
        result = ctypes.c_size_t()
        if not hwnd or not user32.SendMessageTimeoutW(hwnd, 0x0319, hwnd, 47 << 16, 2, 750, ctypes.byref(result)):
            raise RuntimeError("No se pudo enviar la orden de pausa al reproductor.")

    def play_pause(self) -> None:
        self._send_media_key_event(VK_MEDIA_PLAY_PAUSE)

    def next_track(self) -> None:
        self._send_media_key_event(VK_MEDIA_NEXT_TRACK)

    def previous_track(self) -> None:
        self._send_media_key_event(VK_MEDIA_PREV_TRACK)

    @staticmethod
    def _send_media_key_event(virtual_key: int) -> None:
        if not hasattr(ctypes, "windll") or not hasattr(ctypes.windll, "user32"):
            raise RuntimeError("Los controles multimedia solo están disponibles en Windows.")
        user32 = ctypes.windll.user32
        user32.keybd_event(virtual_key, 0, KEYEVENTF_EXTENDEDKEY, 0)
        user32.keybd_event(virtual_key, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)


class BackgroundDucker:
    """Lower other applications' sessions on one COM thread, then restore them."""
    def __init__(self, factor=0.45):
        self.factor = max(0.05, min(1.0, factor))
        self._commands = queue.Queue()
        self._saved = {}
        self._changed = set()
        self._depth = 0
        self._thread = threading.Thread(target=self._run, name="LeytechBackgroundVolume", daemon=True)
        self._thread.start()

    def begin(self):
        self._submit("begin")

    def end(self):
        self._submit("end")

    def _submit(self, command):
        if not self._thread.is_alive():
            return
        done = threading.Event()
        self._commands.put((command, done))
        done.wait(.4)

    def stop(self):
        self._commands.put(("stop", threading.Event()))
        if self._thread is not threading.current_thread():
            self._thread.join(1.5)

    def _lower(self):
        if AudioUtilities is None:
            return
        for session in AudioUtilities.GetAllSessions():
            try:
                if session.ProcessId in (0, os.getpid()):
                    continue
                process = session.Process
                if process is not None and process.name().lower() in ("sapisvr.exe", "speechruntime.exe", "speechhost.exe"):
                    continue
                key = session.InstanceIdentifier
                if key in self._changed:
                    continue
                volume = session.SimpleAudioVolume
                current = float(volume.GetMasterVolume())
                saved = self._saved.get(key)
                if saved is not None:
                    if abs(current - saved[2]) > .015:
                        # Respect a user's manual volume change during speech.
                        self._saved.pop(key, None)
                        self._changed.add(key)
                    continue
                if current <= 0 or volume.GetMute():
                    continue
                lowered = current * self.factor
                volume.SetMasterVolume(lowered, None)
                self._saved[key] = (volume, current, lowered)
            except Exception:
                continue

    def _restore(self):
        for volume, original, lowered in self._saved.values():
            try:
                if abs(float(volume.GetMasterVolume()) - lowered) <= .015:
                    volume.SetMasterVolume(original, None)
            except Exception:
                pass  # The audio session may have ended already.
        self._saved.clear()
        self._changed.clear()

    def _run(self):
        initialized = False
        try:
            if sys.platform == "win32":
                comtypes.CoInitializeEx(0)
                initialized = True
            while True:
                try:
                    command, done = self._commands.get(timeout=.2)
                except queue.Empty:
                    if self._depth:
                        try:
                            self._lower()
                        except Exception:
                            pass
                    continue
                try:
                    if command == "stop":
                        break
                    if command == "begin":
                        self._depth += 1
                        self._lower()
                    elif command == "end":
                        self._depth = max(0, self._depth - 1)
                        if not self._depth:
                            self._restore()
                except Exception:
                    logger.warning("No se pudo ajustar temporalmente el audio de fondo.")
                finally:
                    done.set()
        finally:
            self._restore()
            if initialized:
                comtypes.CoUninitialize()
