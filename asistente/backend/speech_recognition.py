import array
import json
import math
from pathlib import Path
import re
import statistics
import threading
import time
from collections import deque
from typing import Callable, Optional, Protocol

import speech_recognition as sr
from vosk import KaldiRecognizer, Model, SetLogLevel

from .logger import logger
from .recognition_languages import model_path, installed_languages

MODEL_PATH = Path(__file__).resolve().parent / "models" / "vosk-model-small-es-0.42"
CALIBRATION_SECONDS = 2.0
PHRASE_SILENCE_SECONDS = 2.0
ONLINE_RECOGNITION_TIMEOUT = 8
SENSITIVITY_MULTIPLIERS = {
    "low": 3.4,
    "normal": 2.6,
    "high": 2.0,
    "very_high": 1.6,
}
SENSITIVITY_LABELS = {
    "auto": "Automática",
    "low": "Baja",
    "normal": "Normal",
    "high": "Alta",
    "very_high": "Muy alta",
    "manual": "Manual",
}


class _PyAudioStream(Protocol):
    def stop_stream(self) -> None: ...


class _MicrophoneStream(Protocol):
    pyaudio_stream: _PyAudioStream


class _AudioStream(Protocol):
    def read(self, size: int) -> bytes: ...


class _MicrophoneSource(Protocol):
    CHUNK: int
    SAMPLE_RATE: int
    stream: _AudioStream


class VoiceListener:
    def __init__(
        self,
        on_text: Callable[[str], None],
        device_index: Optional[int] = None,
        sensitivity: str = "auto",
        manual_threshold: int = 500,
        dynamic_adjustment: bool = True,
        recognition_mode: str = "offline",
        on_status: Optional[Callable[[str, str], None]] = None,
        english_music: bool = True,
        on_audio_level=None,
    ):
        if recognition_mode not in {"online", "offline"}:
            raise ValueError("El modo de reconocimiento de voz no es válido.")
        self.on_text = on_text
        self._on_audio_level = on_audio_level
        self._last_level_report = 0.0
        self.device_index = device_index
        try:
            self.microphone = sr.Microphone(device_index=device_index, sample_rate=None, chunk_size=1024)
        except (OSError, AttributeError, ValueError, AssertionError):
            self.microphone = None
        self.enabled = False
        self.thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._active_stream: _MicrophoneStream | None = None
        self._generation = 0
        self._last_text = ""
        self._last_text_time = 0.0
        self._english_music = bool(english_music)
        self._english_model = None
        self._model: Model | None = None
        self._model_lock = threading.Lock()
        self._calibration_requested = threading.Event()
        self._calibration_only = False
        self._has_calibrated = False
        self._sensitivity = sensitivity
        self._manual_threshold = max(1, int(manual_threshold))
        self._dynamic_adjustment = bool(dynamic_adjustment)
        self._recognition_mode = recognition_mode
        self._online_retry_at = 0.0
        self._noise_level = 0.0
        self._energy_threshold = self._manual_threshold
        self._status = "MICROPHONE_OFF"
        self._on_status = on_status
        SetLogLevel(-1)

    @staticmethod
    def list_microphones() -> list[dict[str, object]]:
        audio = sr.Microphone.get_pyaudio().PyAudio()
        try:
            try:
                default = audio.get_default_input_device_info()
            except OSError:
                default = None
            devices = []
            default_index = int(default['index']) if default is not None else None
            host = default.get('hostApi') if default is not None else None
            if default is not None and default.get('maxInputChannels', 0) > 0:
                devices.append({'index': default_index, 'name': default.get('name') or 'Micrófono predeterminado', 'is_default': True})
            headset = []
            for index in range(audio.get_device_count()):
                info = audio.get_device_info_by_index(index)
                name = str(info.get('name', ''))
                if index == default_index or info.get('maxInputChannels', 0) <= 0:
                    continue
                if host is not None and info.get('hostApi') != host:
                    continue
                if default is not None and name == str(default.get('name', '')):
                    continue
                if re.search(r'stereo mix|mezcla est[eé]reo|loopback|virtual|cable|sound mapper|asignador|primary|primario', name, re.I):
                    continue
                if re.search(r'headset|headphone|auricular|hands.free|manos libres|bluetooth|usb.*(?:mic|audio)|(?:mic|audio).*usb|micr[oó]fono|microphone', name, re.I):
                    headset.append({'index': index, 'name': name, 'is_default': False})
            # Prefer a headset that appeared since the previous scan.
            previous = getattr(VoiceListener, '_known_headset_names', set())
            headset.sort(key=lambda item: item['name'] in previous)
            VoiceListener._known_headset_names = {item['name'] for item in headset}
            if headset:
                devices.append(headset[0])
            return devices
        finally:
            audio.terminate()

    @staticmethod
    def _rms(audio_data: bytes) -> float:
        samples = array.array("h")
        samples.frombytes(audio_data[: len(audio_data) - len(audio_data) % samples.itemsize])
        if not samples:
            return 0.0
        if samples.itemsize != 2:
            raise RuntimeError("El micrófono debe producir audio PCM de 16 bits.")
        return math.sqrt(sum(sample * sample for sample in samples) / len(samples))

    def _emit_status(self, state: str, message: str = "") -> None:
        with self._lock:
            self._status = state
        if self._on_status is not None:
            self._on_status(state, message)

    def _load_model(self) -> Model:
        with self._model_lock:
            if self._model is None:
                if not (MODEL_PATH / "conf" / "model.conf").is_file():
                    raise FileNotFoundError(
                        f"No se encontró el modelo español de Vosk en {MODEL_PATH}. "
                        "Instálalo con «python -m backend.setup_voice_model»."
                    )
                logger.info("Cargando modelo español de reconocimiento de voz offline.")
                self._model = Model(str(MODEL_PATH))
                logger.info("Modelo español offline cargado.")
            return self._model

    def start(self) -> None:
        if self.microphone is None:
            self._emit_status("MICROPHONE_ERROR", "No se pudo abrir el micrófono. Selecciona otro dispositivo en Ajustes.")
            return
        with self._lock:
            self._calibration_only = False
            self.enabled = True
            if self.thread and self.thread.is_alive():
                return
            self._start_thread_locked()

    @property
    def status(self) -> str:
        with self._lock:
            return self._status

    def request_calibration(self) -> None:
        active_stream = None
        with self._lock:
            self._calibration_requested.set()
            if self.thread and self.thread.is_alive():
                if self.enabled:
                    return
                self._calibration_only = True
                self.enabled = True
                self._generation += 1
                active_stream = self._active_stream
            else:
                self._calibration_only = True
                self.enabled = True
                self._start_thread_locked()
        if active_stream is not None:
            try:
                active_stream.pyaudio_stream.stop_stream()
            except (AttributeError, OSError):
                logger.exception("No se pudo interrumpir el micrófono para recalibrarlo.")

    def _start_thread_locked(self) -> None:
        self.thread = threading.Thread(target=self._listening_loop, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        with self._lock:
            self.enabled = False
            self._calibration_only = False
            self._generation += 1
            self._calibration_requested.clear()
            active_stream = self._active_stream
        if active_stream is not None:
            try:
                active_stream.pyaudio_stream.stop_stream()
            except (AttributeError, OSError):
                logger.exception("No se pudo detener inmediatamente la captura del micrófono.")

    def set_device_index(self, device_index: Optional[int]) -> None:
        was_enabled = self.enabled
        microphone = sr.Microphone(
            device_index=device_index,
            sample_rate=None,
            chunk_size=1024,
        )
        self.stop()
        if self.thread and self.thread.is_alive() and self.thread is not threading.current_thread():
            self.thread.join(timeout=3)
            if self.thread.is_alive():
                if was_enabled:
                    self.start()
                raise RuntimeError("El reconocimiento sigue usando el micrófono actual.")
        self.device_index = device_index
        self.microphone = microphone
        self._noise_level = 0.0
        self._has_calibrated = False
        if was_enabled:
            self.start()

    def configure_sensitivity(
        self,
        sensitivity: str,
        manual_threshold: int,
        dynamic_adjustment: bool,
    ) -> None:
        if sensitivity not in {*SENSITIVITY_MULTIPLIERS, "auto", "manual"}:
            raise ValueError("El modo de sensibilidad del micrófono no es válido.")
        if (
            not isinstance(manual_threshold, int)
            or isinstance(manual_threshold, bool)
            or not 1 <= manual_threshold <= 32767
        ):
            raise ValueError("El umbral manual debe estar entre 1 y 32767.")
        if not isinstance(dynamic_adjustment, bool):
            raise ValueError("El ajuste dinámico debe ser verdadero o falso.")
        with self._lock:
            self._sensitivity = sensitivity
            self._manual_threshold = manual_threshold
            self._dynamic_adjustment = bool(dynamic_adjustment)
            self._energy_threshold = self._select_threshold(self._noise_level)

    def _select_threshold(self, noise_level: float) -> int:
        if self._sensitivity == "manual":
            return self._manual_threshold
        multiplier = SENSITIVITY_MULTIPLIERS.get(self._sensitivity, 2.4)
        return max(60, round(noise_level * multiplier), round(noise_level + 80))

    def _calibrate(self, source: _MicrophoneSource) -> bool:
        self._calibration_requested.clear()
        logger.info("Calibración iniciada...")
        self._emit_status("CALIBRATING_MICROPHONE")
        logger.info("Analizando ruido ambiental...")
        readings = []
        deadline = time.monotonic() + CALIBRATION_SECONDS
        while self.enabled and time.monotonic() < deadline:
            frame = source.stream.read(source.CHUNK)
            level = self._rms(frame)
            if level > 0:
                readings.append(level)
        if not self.enabled:
            return False

        noise_level = statistics.median(readings) if readings else 0.0
        if readings:
            readings.sort()
            upper_noise = readings[min(len(readings) - 1, round((len(readings) - 1) * 0.8))]
            noise_level = max(noise_level, upper_noise * 0.75)
        with self._lock:
            self._noise_level = noise_level
            threshold = self._select_threshold(noise_level)
            self._energy_threshold = threshold

        logger.info("Nivel de ruido: %d", round(noise_level))
        logger.info(
            "Umbral/sensibilidad seleccionado: %d (%s)",
            threshold,
            SENSITIVITY_LABELS[self._sensitivity],
        )
        logger.info("Calibración completada.")
        self._has_calibrated = True
        self._emit_status("MICROPHONE_READY")
        return True

    def _update_noise_floor(self, level: float) -> int:
        with self._lock:
            if (
                self._dynamic_adjustment
                and self._sensitivity != "manual"
                and level < self._energy_threshold
            ):
                if self._noise_level == 0:
                    self._noise_level = level
                else:
                    self._noise_level = self._noise_level * 0.96 + level * 0.04
                self._energy_threshold = self._select_threshold(self._noise_level)
            return self._energy_threshold

    def _with_english_title(self, text, result, pcm, sample_rate, online=None):
        if not self._english_music or 'en-US' not in installed_languages():
            return text
        pattern = r'\breproduce\b(?:\s+(?:la\s+)?(?:siguiente\s+)?(?:canci[oó]n|tema|m[uú]sica)\b)?\s*'
        prefix = re.search(pattern, text, re.I)
        if prefix is None or not text[prefix.end():].strip():
            return text
        # No modificar órdenes encadenadas ni frases que no sean de música.
        if re.search(r'\by\s+(?:baja|sube|pausa|reproduce|volumen|rein[ií]ciate)\b', text, re.I):
            return text
        try:
            if not result or not result.get('result'):
                decoder = KaldiRecognizer(self._load_model(), sample_rate)
                decoder.SetWords(True)
                decoder.AcceptWaveform(pcm)
                result = json.loads(decoder.FinalResult())
            local_prefix = re.search(pattern, result.get('text', ''), re.I)
            words = result.get('result', [])
            if local_prefix is None:
                return text
            boundary = len(result['text'][:local_prefix.end()].split()) - 1
            if boundary < 0 or boundary >= len(words):
                return text
            offset = int(float(words[boundary]['end']) * sample_rate) * 2
            query_audio = pcm[max(0, offset):]
            if len(query_audio) < sample_rate // 4:
                return text
            if self._english_model is None:
                self._english_model = Model(str(model_path('en-US')))
            decoder = KaldiRecognizer(self._english_model, sample_rate)
            decoder.SetWords(True)
            decoder.AcceptWaveform(query_audio)
            english = json.loads(decoder.FinalResult())
            candidate = str(english.get('text', '')).strip()
            english_words = english.get('result', [])
            spanish_words = words[boundary + 1:]
            def confidence(items):
                return sum(float(word.get('conf', 0)) for word in items) / max(1, len(items))
            # Conservar español si el segundo modelo no ofrece una mejora clara.
            if not candidate or confidence(english_words) < max(.65, confidence(spanish_words) + .04):
                return text
            if online is not None:
                try:
                    candidate = online.recognize_google(sr.AudioData(query_audio, sample_rate, 2), language='en-US').strip() or candidate
                except (sr.UnknownValueError, sr.RequestError, OSError, TimeoutError):
                    pass
            return text[:prefix.end()].rstrip() + ' ' + candidate
        except Exception:
            return text

    def _report_audio_level(self, level, threshold):
        now = time.monotonic()
        callback = self._on_audio_level
        if callback is not None and now - self._last_level_report >= .3:
            self._last_level_report = now
            callback(round(level), threshold)

    def _recognition_loop(self, source, generation, model):
        recognizer = KaldiRecognizer(model, source.SAMPLE_RATE)
        recognizer.SetWords(True)
        segments, words = [], []
        audio = bytearray()
        silence = 0
        previous_partial = ""
        while self.enabled and generation == self._generation:
            if self._calibration_requested.is_set():
                return
            frame = source.stream.read(source.CHUNK)
            level = self._rms(frame)
            threshold = self._update_noise_floor(level)
            self._report_audio_level(level, threshold)
            # Conservar audio bilingüe hasta 30 s; la transcripción no se corta.
            if audio is not None:
                audio.extend(frame)
                if len(audio) > source.SAMPLE_RATE * 2 * 30:
                    audio = None
            complete = recognizer.AcceptWaveform(frame)
            partial = json.loads(recognizer.PartialResult()).get("partial", "") if not complete else ""
            speech = level >= threshold or bool(partial and partial != previous_partial)
            if speech:
                silence = 0
            else:
                silence += len(frame) // 2
            previous_partial = partial
            if complete:
                result = json.loads(recognizer.Result())
                if result.get("text"):
                    segments.append(result["text"])
                    words.extend(result.get("result", []))
            if silence < source.SAMPLE_RATE * PHRASE_SILENCE_SECONDS:
                continue
            result = json.loads(recognizer.FinalResult())
            if result.get("text"):
                segments.append(result["text"])
                words.extend(result.get("result", []))
            text = " ".join(segments).strip()
            if text:
                if audio is not None:
                    text = self._with_english_title(text, {"text":text,"result":words}, bytes(audio), source.SAMPLE_RATE)
                self._deliver_recognized_text(text)
            recognizer.Reset()
            segments, words, audio = [], [], bytearray()
            silence, previous_partial = 0, ""

    def _deliver_recognized_text(self, recognized: str) -> None:
        normalized = re.sub(r"[\W_]+", " ", recognized.casefold()).strip()
        now = time.monotonic()
        if normalized != self._last_text or now - self._last_text_time >= 1.5:
            self._last_text = normalized
            self._last_text_time = now
            self.on_text(recognized)

    def _recognize_offline_audio(self, audio: sr.AudioData) -> None:
        try:
            model = self._load_model()
            recognizer = KaldiRecognizer(model, audio.sample_rate)
            recognizer.SetWords(True)
            pcm = audio.get_raw_data(convert_width=2)
            recognizer.AcceptWaveform(pcm)
            result = json.loads(recognizer.FinalResult())
            text = str(result.get("text", "")).strip()
            if text:
                text = self._with_english_title(text, result, pcm, audio.sample_rate)
                self._deliver_recognized_text(text)
        except Exception:
            logger.exception("No se pudo procesar la frase con el reconocimiento offline de respaldo.")

    def _recognize_online_phrase(self, recognizer: sr.Recognizer, audio: sr.AudioData) -> None:
        # Keep the selected mode unchanged. Only service/network failures
        # temporarily route audio to the local model; unclear speech is not
        # evidence of a lost connection.
        if time.monotonic() < getattr(self, "_online_retry_at", 0.0):
            self._recognize_offline_audio(audio)
            return
        try:
            recognized = recognizer.recognize_google(audio, language="es-ES").strip()
        except sr.UnknownValueError:
            logger.info("El reconocimiento online no pudo entender la frase.")
        except (sr.RequestError, OSError, TimeoutError):
            self._online_retry_at = time.monotonic() + 30.0
            logger.warning("Servicio online no disponible; usando reconocimiento offline durante 30 segundos.")
            self._recognize_offline_audio(audio)
        else:
            self._online_retry_at = 0.0
            if recognized:
                recognized = self._with_english_title(recognized, None, audio.get_raw_data(convert_width=2), audio.sample_rate, online=recognizer)
                self._deliver_recognized_text(recognized)

    def _online_recognition_loop(self, source: _MicrophoneSource, generation: int) -> None:
        recognizer = sr.Recognizer()
        recognizer.operation_timeout = ONLINE_RECOGNITION_TIMEOUT
        pre_roll: deque[bytes] = deque(maxlen=4)
        phrase_frames: list[bytes] = []
        quiet_chunks = 0
        in_phrase = False

        while self.enabled and generation == self._generation:
            if self._calibration_requested.is_set():
                return
            frame = source.stream.read(source.CHUNK)
            level = self._rms(frame)
            threshold = self._update_noise_floor(level)
            self._report_audio_level(level, threshold)

            if not in_phrase:
                if level >= threshold:
                    phrase_frames = [*pre_roll, frame]
                    pre_roll.clear()
                    quiet_chunks = 0
                    in_phrase = True
                else:
                    pre_roll.append(frame)
                continue

            phrase_frames.append(frame)
            if level < threshold:
                quiet_chunks += 1
            else:
                quiet_chunks = 0

            if quiet_chunks * source.CHUNK >= source.SAMPLE_RATE * PHRASE_SILENCE_SECONDS:
                audio = sr.AudioData(b"".join(phrase_frames), source.SAMPLE_RATE, 2)
                self._recognize_online_phrase(recognizer, audio)
                phrase_frames.clear()
                quiet_chunks = 0
                in_phrase = False

    def _listening_loop(self) -> None:
        fatal_error = False
        calibration_completed = False
        try:
            model = self._load_model() if self._recognition_mode == "offline" else None
            while self.enabled:
                with self._lock:
                    generation = self._generation
                    calibration_only = self._calibration_only
                try:
                    with self.microphone as source:
                        with self._lock:
                            self._active_stream = source.stream
                        try:
                            if self._sensitivity == 'auto' and not self._calibration_requested.is_set() and not calibration_only:
                                self._has_calibrated = True
                                self._emit_status("LISTENING")
                            elif not self._has_calibrated or self._calibration_requested.is_set():
                                calibration_completed = self._calibrate(source)
                            else:
                                self._emit_status("LISTENING")
                            if calibration_only:
                                break
                            if self.enabled and generation == self._generation:
                                if self._recognition_mode == "offline":
                                    self._recognition_loop(source, generation, model)
                                else:
                                    self._online_recognition_loop(source, generation)
                        finally:
                            with self._lock:
                                self._active_stream = None
                    if self._calibration_requested.is_set() and self.enabled:
                        continue
                    if self.enabled and generation == self._generation:
                        time.sleep(0.1)
                except OSError:
                    if not self.enabled or generation != self._generation:
                        continue
                    logger.exception("Error de dispositivo al capturar audio.")
                    self._emit_status("MICROPHONE_ERROR", "No se pudo capturar el audio del micrófono.")
                    time.sleep(0.5)
        except Exception as error:
            fatal_error = True
            logger.exception("No se pudo iniciar el reconocimiento de voz.")
            self._emit_status("MICROPHONE_ERROR", str(error))
        finally:
            with self._lock:
                if fatal_error:
                    self.enabled = False
                if self._calibration_only and calibration_completed:
                    self.enabled = False
                    self._calibration_only = False
                if self.thread is threading.current_thread():
                    self.thread = None
                if self.enabled:
                    self._start_thread_locked()
