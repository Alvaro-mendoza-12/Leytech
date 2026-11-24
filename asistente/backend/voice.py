import math
import queue
import sys
import re
import threading
from typing import Callable, Optional

import comtypes
import comtypes.client
import pyttsx3

from .logger import logger
from .config import normalize_voice_speed


def _registry_voices():
    import winreg
    result = []
    for root, prefix in ((winreg.HKEY_CURRENT_USER, 'HKEY_CURRENT_USER'), (winreg.HKEY_LOCAL_MACHINE, 'HKEY_LOCAL_MACHINE')):
        for path in (r'SOFTWARE\Microsoft\Speech\Voices\Tokens', r'SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens'):
            try:
                with winreg.OpenKey(root, path) as key:
                    for index in range(winreg.QueryInfoKey(key)[0]):
                        name = winreg.EnumKey(key, index)
                        try:
                            with winreg.OpenKey(key, name) as token:
                                description = winreg.QueryValueEx(token, '')[0]
                            result.append((prefix + '\\' + path + '\\' + name, str(description)))
                        except OSError:
                            continue
            except OSError:
                continue
    unique = {}
    for identifier, name in result:
        identity = re.sub(r'\s+desktop\b', '', name, flags=re.I).split(' - ')[0].casefold()
        unique.setdefault(identity, (identifier, name))
    result = list(unique.values())
    preferred = ('helena', 'sabina', 'pablo', 'raul')
    result.sort(key=lambda item: next((index for index, name in enumerate(preferred) if name in item[1].lower()), 4))
    return result


def list_available_voices():
    """Enumerate the same SAPI voices used for speech, on this COM thread."""
    comtypes.CoInitialize()
    try:
        if sys.platform == 'win32':
            return _registry_voices()
        engine = pyttsx3.init()
        return [(str(voice.id), str(voice.name)) for voice in engine.getProperty('voices')]
    except Exception:
        return _registry_voices() if sys.platform == 'win32' else []
    finally:
        comtypes.CoUninitialize()


class AsyncWindowsVoice:
    """Submit SAPI speech asynchronously, polling without blocking Python."""
    def __init__(self, worker):
        self._worker = worker
        self._voice = comtypes.client.CreateObject("SAPI.SpVoice", dynamic=True)
        self._text = ""
        self._default_voice = self._voice.Voice
        self._selected_voice_id = None

    def setProperty(self, name, value):
        if name == "voice":
            if value == self._selected_voice_id:
                return
            selected = self._default_voice
            if value and value in {identifier for identifier, _ in list_available_voices()}:
                try:
                    token = comtypes.client.CreateObject('SAPI.SpObjectToken', dynamic=True)
                    token.SetId(value, '', False)
                    selected = token
                except Exception:
                    pass  # A removed voice falls back to the original voice.
            self._voice.Voice = selected
            self._selected_voice_id = value
        elif name == "volume":
            self._voice.Volume = max(0, min(100, round(value * 100)))
        elif name == "rate":
            # Preserve the rate conversion used by the previous SAPI driver.
            self._voice.Rate = max(-10, min(10, int(math.log(value / 137.89, 1.11))))

    def say(self, text):
        self._text = text

    def runAndWait(self):
        # SVSFlagsAsync | SVSFIsNotXML: return immediately; speak plain text.
        self._voice.Speak(self._text, 1 | 16)
        while not self._voice.WaitUntilDone(0):
            if self._worker._stop_requested.wait(0.015) or self._worker._speech_cancelled():
                self._voice.Speak("", 1 | 2)  # purge current and queued SAPI speech
                break


def create_voice_engine(worker):
    if sys.platform == "win32":
        return AsyncWindowsVoice(worker)
    return pyttsx3.init()


class TTSWorker:
    def __init__(self, on_state_change: Optional[Callable[[str], None]] = None):
        self.queue: "queue.Queue[tuple[str, Optional[Callable[[], None]], int] | None]" = queue.Queue()
        self.engine = None
        self._speed = "normal"
        self._volume = 1.0
        self._voice_id = ""
        self._settings_lock = threading.Lock()
        self._engine_ready = threading.Event()
        self._speech_generation = 0
        self._active_generation = 0
        self.on_state_change = on_state_change
        self.running = True
        self._stop_requested = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self) -> None:
        comtypes.CoInitialize()
        try:
            self._run_engine()
        finally:
            comtypes.CoUninitialize()

    def _run_engine(self) -> None:
        try:
            self.engine = create_voice_engine(self)
        except Exception:
            logger.exception("No fue posible iniciar el motor de voz.")
            self.engine = None
            self._engine_ready.set()
            while True:
                try:
                    item = self.queue.get_nowait()
                except queue.Empty:
                    break
                if item is not None:
                    if self.on_state_change:
                        self.on_state_change("SPEAKING_END")
                    if item[1] is not None:
                        try:
                            item[1]()
                        except Exception:
                            logger.exception("Error al completar una acción sin síntesis de voz.")
            return

        self._engine_ready.set()
        while self.running:
            try:
                item = self.queue.get(timeout=0.5)
            except queue.Empty:
                continue

            if item is None:
                break
            text, on_complete = item[:2]
            generation = item[2] if len(item) > 2 else getattr(self, "_speech_generation", 0)
            self._active_generation = generation
            if self._speech_cancelled():
                continue
            with self._settings_lock:
                volume = self._volume
                speed = self._speed
                voice_id = self._voice_id

            if volume > 0 and self.on_state_change:
                self.on_state_change("SPEAKING_START")

            try:
                if volume > 0:
                    self.engine.setProperty("voice", voice_id)
                    self.engine.setProperty("rate", normalize_voice_speed(speed))
                    self.engine.setProperty("volume", volume)
                    self.engine.say(text)
                    self.engine.runAndWait()
            except Exception:
                logger.exception("Error durante la síntesis de voz.")
            finally:
                if volume > 0 and self.on_state_change:
                    self.on_state_change("SPEAKING_END")
                if on_complete is not None and not self._speech_cancelled():
                    try:
                        on_complete()
                    except Exception:
                        logger.exception("Error al completar una acción después de hablar.")

    def speak(self, text: str, on_complete: Optional[Callable[[], None]] = None) -> None:
        if not text:
            if on_complete is not None:
                on_complete()
            return
        with self._settings_lock:
            muted = self._volume == 0
        if muted:
            if on_complete is not None:
                on_complete()
            return
        if self._engine_ready.is_set() and self.engine is None:
            logger.warning("El motor de voz no está disponible; no se reproduce audio.")
            if self.on_state_change:
                self.on_state_change("SPEAKING_END")
            if on_complete is not None:
                on_complete()
            return
        with self._settings_lock:
            self.queue.put((text, on_complete, self._speech_generation))

    def _speech_cancelled(self) -> bool:
        return getattr(self, "_active_generation", 0) != getattr(self, "_speech_generation", 0)

    def interrupt(self) -> None:
        # COM stays on the voice thread; the SAPI loop polls this generation.
        with self._settings_lock:
            self._speech_generation = getattr(self, "_speech_generation", 0) + 1

    def set_speed(self, speed: str | int | float) -> None:
        speed = normalize_voice_speed(speed)
        with self._settings_lock:
            self._speed = speed

    def set_voice(self, voice_id: str) -> None:
        with self._settings_lock:
            self._voice_id = voice_id if isinstance(voice_id, str) else ""

    def set_volume(self, volume: int) -> None:
        normalized_volume = max(0, min(100, int(volume))) / 100.0
        with self._settings_lock:
            self._volume = normalized_volume

    def stop(self) -> None:
        self._stop_requested.set()
        self.running = False
        self.queue.put(None)
