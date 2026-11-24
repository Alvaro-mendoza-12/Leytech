import ctypes
from http.client import HTTPException
import os
import random
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .ai import AIClient, client_from_config
from .music import MusicPlayer, parse_music_command
from .environment import EnvironmentMonitor
from .audio_control import AudioController, BackgroundDucker
from .chat_history import append_chat_message, clear_chat_history, export_chat_memory, import_chat_memory
from .command_matcher import match_command, normalize_text
from .command_batch import split_commands
from .commands import COMMANDS
from .config import load_config, save_config, update_config_values
from .logger import logger
from .offline_commands import execute_offline_command
from .speech_recognition import VoiceListener
from .voice import TTSWorker

PROMPT_PATH = Path(__file__).resolve().parents[1] / ".assistant_prompt.txt"


class Assistant:
    def __init__(self, on_event: Callable[[Dict[str, Any]], None]):
        self._emit = on_event
        self._stopping = False
        self.config = load_config()
        # Validate required files before starting any background resource.
        self.system_prompt = self._load_system_prompt()
        self.audio = AudioController()
        self.ai = client_from_config(self.config)
        self.music = MusicPlayer(self._on_music_result, on_state=self._emit,
                                 initial_volume=self.config.get("music_volume", 100),
                                 on_volume_changed=self._on_music_volume_changed)

        self.voice_listener = VoiceListener(
            on_text=self._handle_voice_text,
            device_index=self.config.get("microphone_device_index"),
            sensitivity=self.config.get("microphone_sensitivity", "auto"),
            manual_threshold=self.config.get("microphone_manual_threshold", 500),
            dynamic_adjustment=self.config.get("microphone_dynamic_adjustment", True),
            recognition_mode=self.config.get("voice_recognition_mode", "offline"),
            on_status=self._on_voice_listener_status,
            english_music=self.config.get("recognition_english_music", True),
            on_audio_level=lambda level, threshold: self._emit({"type": "microphone_level", "level": level, "threshold": threshold}),
        )
        self.microphone_enabled = bool(self.config.get("microphone_enabled", True))
        self.current_state = "IDLE"
        self.lock = threading.Lock()
        self._conversation_lock = threading.RLock()
        self._voice_text_lock = threading.Lock()
        self._last_voice_text = ""
        self._last_voice_text_time = 0.0
        self._last_voice_command = ""
        self._last_voice_command_time = 0.0
        self._awaiting_voice_command = False
        self._api_unavailable = False
        self._speaking = False
        self._starting_up = True
        self._environment = None
        self._network_online = None
        self._had_microphones = None
        self._background_ducker = BackgroundDucker()
        self.tts = TTSWorker(on_state_change=self._on_tts_state)
        self._apply_voice_speed()

    def start(self) -> None:
        self._broadcast_state("IDLE")
        if self.microphone_enabled:
            self.voice_listener.start()

    def stop(self) -> None:
        self._stopping = True
        if getattr(self, "_environment", None) is not None:
            self._environment.stop()
        if hasattr(self, "music"):
            self.music.stop()
        self.set_microphone_enabled(False, persist=False)
        self.tts.stop()
        if hasattr(self, "_background_ducker"):
            self._background_ducker.stop()
        # Shutdown runs on the worker, never on Tk's event loop. Wait before
        # allowing a replacement instance to open the microphone and voice.
        for worker in (self.voice_listener.thread, self.tts.thread):
            if worker is not None and worker is not threading.current_thread():
                worker.join()

    @staticmethod
    def _load_system_prompt() -> str:
        try:
            if hasattr(ctypes, "windll"):
                attributes = ctypes.windll.kernel32.GetFileAttributesW(str(PROMPT_PATH))
                if attributes == -1 or not ctypes.windll.kernel32.SetFileAttributesW(str(PROMPT_PATH), attributes | 0x2):
                    raise OSError("No se pudo ocultar el archivo del prompt.")
            prompt = PROMPT_PATH.read_text(encoding="utf-8").strip()
        except OSError as error:
            logger.exception("No se pudo cargar el prompt privado.")
            raise RuntimeError("No se pudo cargar el archivo privado del asistente.") from error
        if not prompt:
            raise RuntimeError("El archivo privado del asistente está vacío.")
        return prompt

    @staticmethod
    def _time_greeting() -> str:
        hour = datetime.now().hour
        if 5 <= hour < 12:
            return "Buenos días"
        if 12 <= hour < 19:
            return "Buenas tardes"
        return "Buenas noches"

    def welcome_message(self) -> str:
        greeting = self._time_greeting()
        username = str(self.config.get("username", "")).strip()
        name = f", {username}" if username else ""
        endings = (
            "¿En qué te puedo ayudar?",
            "¿Qué necesitas?",
            "¿Qué hacemos hoy?",
        )
        return f"{greeting}{name}. {random.choice(endings)}"

    def farewell_message(self) -> str:
        username = str(self.config.get("username", "")).strip()
        farewell = random.choice(("Hasta luego", "Que tengas un buen día", "Nos vemos pronto"))
        return f"{farewell}, {username}." if username else f"{farewell}."

    def _on_tts_state(self, state: str) -> None:
        if getattr(self, "_stopping", False):
            return
        self._broadcast_state(state)
        if state == "SPEAKING_START":
            if getattr(self, "_background_ducker", None) is not None:
                self._background_ducker.begin()
            self.music.set_ducked(True)
            self._speaking = True
            # Keep listening for the wake word while the speaker is active.
            if self.microphone_enabled:
                self.voice_listener.start()
        elif state == "SPEAKING_END":
            if getattr(self, "_background_ducker", None) is not None:
                self._background_ducker.end()
            self.music.set_ducked(False)
            self._speaking = False
            if self.microphone_enabled:
                self.voice_listener.start()

    def _broadcast_state(self, state: str) -> None:
        self.current_state = state
        self._emit({"type": "state", "state": state})

    def _on_voice_listener_status(self, state: str, message: str = "") -> None:
        if not self._speaking or state not in {"LISTENING", "MICROPHONE_READY", "CALIBRATING_MICROPHONE"}:
            self._broadcast_state(state)
        self._emit(
            {"type": "microphone_status", "state": state, "message": message}
        )

    def set_microphone_enabled(self, enabled: bool, persist: bool = True) -> None:
        self.microphone_enabled = bool(enabled)
        self.config["microphone_enabled"] = self.microphone_enabled
        if not self.microphone_enabled:
            with self._voice_text_lock:
                self._awaiting_voice_command = False
        if persist:
            save_config(self.config)
        if self.microphone_enabled:
            self.voice_listener.start()
            state = self.voice_listener.status
            self._broadcast_state(
                state if state in {"CALIBRATING_MICROPHONE", "MICROPHONE_READY", "MICROPHONE_ERROR", "LISTENING"} else "LISTENING"
            )
        else:
            self.voice_listener.stop()
            self._broadcast_state("MICROPHONE_OFF" if not self.microphone_enabled else "SPEAKING")

    def interrupt_speech(self) -> None:
        self.tts.interrupt()
        if getattr(self, "_starting_up", False):
            self._finish_startup()
        if self.microphone_enabled:
            self.voice_listener.start()

    def _handle_voice_text(self, text: str) -> None:
        if not text or not self.microphone_enabled:
            return
        normalized_text = normalize_text(text)
        wake_word = normalize_text(str(self.config.get("wake_word", "Computadora")))
        if not wake_word:
            return
        if self._speaking:
            # Ignore ordinary speech and likely loudspeaker echo during playback.
            if normalized_text in normalize_text(getattr(self, "_last_spoken_text", "")):
                return
            if normalized_text != wake_word and not normalized_text.startswith(f"{wake_word} "):
                return
        if normalized_text == wake_word or normalized_text.startswith(f"{wake_word} "):
            self.interrupt_speech()
        now = time.monotonic()
        with self._voice_text_lock:
            if normalized_text == self._last_voice_text and now - self._last_voice_text_time < 1.5:
                return
            self._last_voice_text = normalized_text
            self._last_voice_text_time = now

            if normalized_text == wake_word:
                self._awaiting_voice_command = True
                return

            if normalized_text.startswith(f"{wake_word} "):
                recognized_words = re.findall(r"[^\W_]+", text, flags=re.UNICODE)
                command_text = " ".join(recognized_words[len(wake_word.split()):])
                self._awaiting_voice_command = False
            elif self._awaiting_voice_command:
                command_text = text.strip()
                self._awaiting_voice_command = False
            else:
                return

            normalized_command = normalize_text(command_text)
            if not normalized_command:
                return
            if (
                normalized_command == self._last_voice_command
                and now - self._last_voice_command_time < 1.5
            ):
                return
            self._last_voice_command = normalized_command
            self._last_voice_command_time = now
        if not self.microphone_enabled:
            return
        self._emit({"type": "voice_command", "text": command_text})

    def handle_request(self, payload: Dict[str, Any]) -> None:
        message_type = payload.get("type")
        if message_type == "user_text":
            text = payload.get("text", "")
            if isinstance(text, str) and text.strip():
                self.interrupt_speech()
                wake = normalize_text(str(self.config.get("wake_word", "Computadora")))
                normalized = normalize_text(text)
                if normalized == wake:
                    self._awaiting_voice_command = True
                    self._broadcast_state("LISTENING")
                    return
                if wake and normalized.startswith(wake + " "):
                    words = list(re.finditer(r"[^\W_]+", text, flags=re.UNICODE))
                    text = text[words[len(wake.split()) - 1].end():].lstrip(" ,:;.!?¿¡")
                with self._conversation_lock:
                    self._record_chat_message("Usuario", text)
                    self._emit({"type": "user_transcription", "text": text})
                    self.process_user_text(text)
        elif message_type == "music_control":
            self.music.control(payload.get("action"), payload.get("value"))
        elif message_type in ('memory_export','memory_import'):
            with self._conversation_lock:
                try:
                    path = payload.get('path')
                    if not isinstance(path,str) or not path:
                        raise ValueError('Selecciona un archivo de memoria.')
                    count = export_chat_memory(path) if message_type=='memory_export' else import_chat_memory(path)
                    self._emit({'type':'memory_changed','action':message_type,'count':count})
                except (OSError,ValueError) as error:
                    self._emit({'type':'memory_error','message':str(error)})
        elif message_type == "clear_memory":
            with self._conversation_lock:
                try:
                    clear_chat_history()
                except OSError:
                    logger.exception("No se pudo borrar la memoria.")
                    self._emit({"type": "memory_error", "message": "No se pudo borrar el historial. Inténtalo de nuevo."})
                else:
                    self._emit({"type": "memory_cleared"})
        elif message_type == "microphone":
            enabled = bool(payload.get("enabled", True))
            self.set_microphone_enabled(enabled, persist=payload.get("persist") is not False)
            if payload.get("announce") is True:
                self._announce("Micrófono encendido." if enabled else "Micrófono apagado.")
        elif message_type == "prepare_restart":
            self.set_microphone_enabled(False, persist=False)
            self._emit({"type": "restart_prepared"})
        elif message_type == "settings":
            settings = payload.get("config", {})
            if settings:
                updated_config = self.config.copy()
                updated_config.update(settings)
                try:
                    microphone_sensitivity = updated_config.get("microphone_sensitivity", "auto")
                    microphone_manual_threshold = updated_config.get("microphone_manual_threshold", 500)
                    microphone_dynamic_adjustment = updated_config.get("microphone_dynamic_adjustment", True)
                    voice_recognition_mode = updated_config.get("voice_recognition_mode", "offline")
                    if voice_recognition_mode not in {"online", "offline"}:
                        raise ValueError("El modo de reconocimiento de voz no es válido.")
                    if microphone_sensitivity not in {
                        "auto",
                        "low",
                        "normal",
                        "high",
                        "very_high",
                        "manual",
                    }:
                        raise ValueError("El modo de sensibilidad del micrófono no es válido.")
                    if (
                        not isinstance(microphone_manual_threshold, int)
                        or isinstance(microphone_manual_threshold, bool)
                        or not 1 <= microphone_manual_threshold <= 32767
                        or not isinstance(microphone_dynamic_adjustment, bool)
                    ):
                        raise ValueError("La sensibilidad manual del micrófono no es válida.")
                except (TypeError, ValueError) as error:
                    self._emit({"type": "settings_error", "message": str(error)})
                    return
                if updated_config.get("wake_word") != self.config.get("wake_word"):
                    with self._voice_text_lock:
                        self._awaiting_voice_command = False
                if (
                    "microphone_device_index" in settings
                    and settings["microphone_device_index"] != self.config.get("microphone_device_index")
                ):
                    try:
                        self.voice_listener.set_device_index(settings["microphone_device_index"])
                    except (OSError, RuntimeError, ValueError) as error:
                        logger.exception("No se pudo cambiar el micrófono.")
                        self._emit({"type": "settings_error", "message": str(error)})
                        return
                try:
                    ai_client = client_from_config(updated_config)
                    save_config(updated_config)
                except Exception as error:
                    logger.exception("No se pudo guardar la configuración.")
                    self._emit({"type": "settings_error", "message": str(error)})
                    return
                self.config = updated_config
                self.voice_listener.configure_sensitivity(
                    microphone_sensitivity,
                    microphone_manual_threshold,
                    microphone_dynamic_adjustment,
                )
                microphone_enabled = bool(updated_config.get("microphone_enabled", True))
                if microphone_enabled != self.microphone_enabled:
                    self.set_microphone_enabled(microphone_enabled, persist=False)
                self._api_unavailable = False
                self.ai = ai_client
                self._apply_voice_speed()
                self._broadcast_state("LISTENING" if self.microphone_enabled else "MICROPHONE_OFF")
                self._emit({"type": "settings_saved"})
        elif message_type == "calibrate_microphone":
            self.voice_listener.request_calibration()
        elif message_type == "welcome":
            if self.microphone_enabled:
                self.voice_listener.start()
            self._announce(self.welcome_message(), on_complete=self._finish_startup)
        elif message_type == "farewell":
            self.set_microphone_enabled(False, persist=False)
            self._announce(self.farewell_message())
        elif message_type == "list_microphones":
            try:
                devices = self.voice_listener.list_microphones()
                self._emit(
                    {
                        "type": "microphones",
                        "devices": devices,
                        "selected": self.config.get("microphone_device_index"),
                    }
                )
            except (OSError, RuntimeError, AttributeError) as error:
                logger.exception("No se pudieron enumerar los micrófonos.")
                self._emit({"type": "microphones", "devices": [], "error": str(error)})
        elif message_type == "reload_config":
            self.config = load_config()
            self.ai = client_from_config(self.config)
            self._apply_voice_speed()

    def _finish_startup(self) -> None:
        if not self._starting_up:
            return
        self._starting_up = False
        self._emit({"type": "startup_finished"})
        if self._environment is None:
            self._environment = EnvironmentMonitor(self._network_changed, self._microphones_changed,
                                                   self.voice_listener.list_microphones, self._network_online)
            self._environment.start()
        if not self._stopping and self.microphone_enabled and not self._speaking:
            self.voice_listener.start()

    def _network_changed(self, online):
        if self._stopping:
            return
        self._network_online = online
        with self._conversation_lock:
            if not self._stopping:
                self._announce("La conexión a internet se ha restablecido." if online else
                               "Se perdió la conexión a internet. El reconocimiento de voz puede continuar offline.")

    def _microphones_changed(self, devices):
        if self._stopping:
            return
        available = bool(devices)
        previous = self._had_microphones
        self._had_microphones = available
        selected = self.config.get('microphone_device_index')
        indices = {item['index'] for item in devices}
        default_name = next((item['name'] for item in devices if item.get('is_default')), None)
        default_changed = hasattr(self, '_default_microphone_name') and default_name != self._default_microphone_name
        self._default_microphone_name = default_name
        if not available:
            self.voice_listener.stop()
            if previous is not False:
                with self._conversation_lock:
                    if not self._stopping:
                        self._announce('No hay ningún micrófono disponible. Conecta un auricular con micrófono o habilita el micrófono del equipo.')
        elif self.voice_listener.microphone is None or previous is False or (selected is not None and selected not in indices) or (selected is None and default_changed):
            target = None if any(item.get('is_default') for item in devices) else devices[0]['index']
            try:
                self.voice_listener.set_device_index(target)
                self.config['microphone_device_index'] = target
                if self.microphone_enabled:
                    self.voice_listener.start()
            except (OSError, RuntimeError, AttributeError):
                if previous is False:
                    with self._conversation_lock:
                        if not self._stopping:
                            self._announce('Se detectó un micrófono, pero no pude activarlo. Revisa los permisos de audio.')
        self._emit({'type': 'microphones', 'devices': devices,
                    'selected': self.config.get('microphone_device_index')})

    def _apply_voice_speed(self) -> None:
        speed = self.config.get("voice_speed", "normal")
        self.tts.set_speed(speed)
        self.tts.set_voice(self.config.get("voice_id", ""))
        volume = self.config.get("voice_volume", 100)
        self.tts.set_volume(volume)

    def process_user_text(self, text: str) -> None:
        if not text.strip():
            return
        with self.lock:
            self._broadcast_state("PROCESSING")
            try:
                orders = split_commands(text)
            except ValueError as error:
                self._announce(str(error))
                return
            for index, order in enumerate(orders, 1):
                if getattr(self, '_stopping', False):
                    break
                try:
                    self._process_single_text(order)
                except Exception:
                    if len(orders) == 1:
                        raise
                    # An online failure must not discard later local controls.
                    self._announce(f"No pude completar la orden {index}. Continuaré con las demás.")

    def _process_single_text(self, normalized_text: str) -> None:
        # Echo commands have priority: their contents are spoken, never
        # interpreted as another command or sent to the online AI.
        repeat = re.match(
            r"^(?:repite|di)(?=$|[\s,:;])[\s,:;]*(.*)$",
            normalized_text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if repeat is not None:
            phrase = repeat.group(1).strip()
            self._announce(phrase or "¿Qué quieres que diga?")
            return
        music_command = parse_music_command(normalized_text)
        if music_command is not None:
            self._announce(self.music.request(**music_command))
            return
        command = match_command(normalized_text)
        if command is not None and command["command"] == "restart_assistant":
            self._announce("Reiniciando el asistente.", on_complete=lambda: self._emit({"type": "restart_requested"}))
            return
        if command is not None and command["command"].startswith("music_volume_"):
            self.music.control(command["command"].replace("music_", "", 1), command.get("value"))
            return
        if command is not None and command["command"] == "voice_volume_set":
            volume = max(0, min(100, int(command.get("value") or 0)))
            self.config["voice_volume"] = volume
            self.tts.set_volume(volume)
            try:
                update_config_values({"voice_volume": volume})
            except OSError:
                logger.exception("No se pudo guardar el volumen de voz del asistente.")
                self._announce("No se pudo guardar el volumen de voz.")
                return
            self._announce(f"Volumen de voz establecido en {volume}%.")
            return
        music_actions = {"pause": "pause", "play_pause": "toggle", "previous_track": "previous", "next_track": "next"}
        if command is not None and command["command"] in music_actions:
            self.music.control(music_actions[command["command"]])
            return
        if command is not None and (command["command"] in COMMANDS or command["command"] == "pause"):
            answer = execute_offline_command(
                self.audio,
                command["command"],
                command.get("value"),
            )
            self._announce(answer)
            return

        if self.ai.is_configured() and not self._api_unavailable:
            try:
                answer = self.ai.ask(self.system_prompt, normalized_text)
            except Exception:
                logger.exception("Error al consultar la IA.")
                self._api_unavailable = True
                answer = "La IA no está disponible. Revisa la API key en Configuración."
                self._announce(answer, speak=False)
                return
        elif self._api_unavailable:
            self._announce(
                "La IA no está disponible. Revisa la API key en Configuración.",
                speak=False,
            )
            return
        else:
            answer = "No entendí la orden."

        self._announce(answer)

    def _on_music_volume_changed(self, volume):
        self.config["music_volume"] = volume
        try:
            update_config_values({"music_volume": volume})
        except OSError:
            self._emit({"type":"assistant_response", "text":"El volumen cambió, pero no pude guardarlo para el próximo inicio."})

    def _on_music_result(self, message: str) -> None:
        if not self._stopping:
            with self._conversation_lock:
                if not self._stopping:
                    self._announce(message)

    def _record_chat_message(self, role: str, text: str) -> None:
        try:
            append_chat_message(role, text)
        except OSError as error:
            logger.exception("No se pudo escribir el historial del chat.")
            self._emit(
                {"type": "history_error", "message": f"No se pudo guardar el historial: {error}"}
            )

    def _announce(
        self,
        text: str,
        speak: bool = True,
        on_complete: Callable[[], None] | None = None,
    ) -> None:
        if getattr(self, "_stopping", False):
            return
        if not text:
            if on_complete is not None:
                on_complete()
            return
        self._record_chat_message("Computadora", text)
        self._emit({"type": "assistant_response", "text": text})
        if speak:
            self._last_spoken_text = text
            self.tts.speak(text, on_complete=on_complete)
        elif self.microphone_enabled and not self._speaking and not getattr(self, "_starting_up", False):
            self.voice_listener.start()
