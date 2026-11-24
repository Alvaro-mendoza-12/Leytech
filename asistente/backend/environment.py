"""Small independent monitors; never run network/device checks on Tk's thread."""
import threading
from urllib.request import Request, urlopen


def internet_available():
    try:
        with urlopen(Request('https://www.google.com/generate_204', method='GET'), timeout=3) as response:
            return response.status == 204
    except Exception:
        return False


class EnvironmentMonitor:
    def __init__(self, network_changed, microphones_changed, scan_microphones, initial_network=None):
        self.network_changed = network_changed
        self.microphones_changed = microphones_changed
        self.scan_microphones = scan_microphones
        self.initial_network = initial_network
        self.closed = threading.Event()

    def start(self):
        threading.Thread(target=self._network_loop, name='LeytechConnectivity', daemon=True).start()
        threading.Thread(target=self._microphone_loop, name='LeytechDevices', daemon=True).start()

    def _network_loop(self):
        state = self.initial_network
        while not self.closed.is_set():
            online = internet_available()
            if state is None:
                state = online
            elif online != state:
                state = online
                if not self.closed.is_set():
                    self.network_changed(online)
            if self.closed.wait(4):
                return

    def _microphone_loop(self):
        previous = None
        while not self.closed.is_set():
            try:
                devices = self.scan_microphones()
            except Exception:
                # Enumeration failure is not evidence that a device vanished.
                if self.closed.wait(2):
                    return
                continue
            fingerprint = [(d.get('index'), d.get('name'), d.get('is_default')) for d in devices]
            if fingerprint != previous:
                previous = fingerprint
                if not self.closed.is_set():
                    self.microphones_changed(devices)
            if self.closed.wait(2):
                return

    def stop(self):
        self.closed.set()
