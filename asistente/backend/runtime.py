"""Run the assistant inside the GUI process, without sockets or a child service."""
import queue
import threading
from typing import Any, Callable


class AssistantRuntime:
    def __init__(self, on_event: Callable[[dict[str, Any]], None], *, factory=None):
        self._on_event = on_event
        self._factory = factory
        self._assistant = None
        self._requests: queue.Queue = queue.Queue()
        self._closing = threading.Event()
        self._ready = threading.Event()
        self._lifecycle_lock = threading.Lock()
        self._headset_connected = threading.Event()
        self._thread = threading.Thread(target=self._run, name="LeyTechAssistant", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def is_alive(self) -> bool:
        return self._thread.is_alive()

    def submit(self, payload: dict[str, Any]) -> bool:
        with self._lifecycle_lock:
            if self._closing.is_set() or not self._ready.is_set() or not self._headset_connected.is_set():
                return False
            if payload.get("type") in {"user_text", "interrupt_speech"} and self._assistant is not None:
                self._assistant.interrupt_speech()
            if payload.get("type") == "interrupt_speech":
                return True
            self._requests.put(payload.copy())
            return True

    def close(self) -> None:
        with self._lifecycle_lock:
            self._closing.set()
            self._ready.clear()
            self._requests.put(None)

    def _run(self) -> None:
        assistant = None
        com = None
        try:
            # Windows audio objects must be initialized on the thread using them.
            import comtypes
            comtypes.CoInitialize()
            com = comtypes
            factory = self._factory
            if factory is None:
                from .assistant import Assistant
                factory = Assistant
            from .headphones import connected_headphones
            def monitor_headphones():
                comtypes.CoInitialize()
                try:
                    while not self._closing.is_set():
                        try:
                            connected = bool(connected_headphones())
                        except Exception:
                            connected = False
                        if connected:
                            self._headset_connected.set()
                        else:
                            self._headset_connected.clear()
                            current = self._assistant
                            if current is not None and not current._stopping:
                                # Interrupt even if the request worker is waiting
                                # for an online answer. COM speech stays on TTS.
                                current._stopping = True
                                current.interrupt_speech()
                                current.voice_listener.stop()
                                current.music.control('pause')
                                self._on_event({'type':'headset_state', 'available':False})
                        if self._closing.wait(1):
                            return
                finally:
                    comtypes.CoUninitialize()
            threading.Thread(target=monitor_headphones, name='LeytechHeadsetGuard', daemon=True).start()
            previous_available = None
            while not self._closing.is_set():
                try:
                    names = connected_headphones()
                except Exception:
                    names = []  # Device scan failure must not enable the assistant.
                available = bool(names)
                if available:
                    self._headset_connected.set()
                else:
                    self._headset_connected.clear()
                # A disconnect/reconnect while an online call was pending
                # still requires a fresh instance with active speech resources.
                if available and assistant is not None and assistant._stopping:
                    with self._lifecycle_lock:
                        self._ready.clear()
                        self._assistant = None
                    assistant.stop()
                    assistant = None
                    previous_available = None
                if available != previous_available:
                    self._on_event({'type': 'headset_state', 'available': available})
                    previous_available = available
                if not available:
                    with self._lifecycle_lock:
                        self._ready.clear()
                        self._assistant = None
                    if assistant is not None:
                        assistant.stop()
                        assistant = None
                    # Discard commands from the disconnected session.
                    while not self._requests.empty():
                        try:
                            self._requests.get_nowait()
                        except queue.Empty:
                            break
                    self._closing.wait(1)
                    continue
                if assistant is None:
                    assistant = factory(on_event=self._on_event)
                    if self._closing.is_set():
                        break
                    self._assistant = assistant
                    assistant.start()
                    with self._lifecycle_lock:
                        if self._closing.is_set():
                            break
                        self._ready.set()
                    self._on_event({'type': 'runtime_ready'})
                try:
                    payload = self._requests.get(timeout=1)
                except queue.Empty:
                    continue
                if payload is None or self._closing.is_set():
                    break
                try:
                    assistant.handle_request(payload)
                except Exception as error:
                    from .logger import logger
                    logger.exception('Error procesando una solicitud local.')
                    self._on_event({'type': 'runtime_error', 'message': str(error)})
        except Exception as error:
            self._on_event({"type": "runtime_error", "message": str(error)})
        finally:
            self._assistant = None
            self._ready.clear()
            self._closing.set()
            try:
                if assistant is not None:
                    assistant.stop()
            except Exception as error:
                self._on_event({"type": "runtime_error", "message": str(error)})
            finally:
                if com is not None:
                    com.CoUninitialize()
                self._on_event({"type": "runtime_stopped"})
