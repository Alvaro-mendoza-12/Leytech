"""Headless yt-dlp + LibVLC playback; no browser or external VLC window."""
import os
import sys
import shutil
from pathlib import Path
import queue
import re
import threading
import time
from collections import OrderedDict
from urllib.parse import urlsplit, parse_qs


class QuietExtractorLog:
    def debug(self, *_args): pass
    def info(self, *_args): pass
    def warning(self, *_args): pass
    def error(self, *_args): pass


def parse_music_command(text):
    match = re.fullmatch(r'\s*reproduce(?:\s+(.*?))?[\s.!?]*', text, re.I | re.S)
    if match is None:
        return None
    query = re.sub(r'\s+en\s+(?:youtube|you\s+tube|spotify)[\s.!?]*$', '', match.group(1) or '', flags=re.I)
    query = re.sub(r'^(?:(?:la\s+)?siguiente\s+)?(?:canci[oó]n|tema|m[uú]sica)(?:\s+|$)', '', query, flags=re.I)
    return {'query': query.strip(' \"“”'), 'provider': 'youtube'}


def load_vlc():
    global _vlc_dll_directory
    if os.name == 'nt':
        bundle = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))
        candidates = [bundle / 'vlc', Path(sys.executable).resolve().parent / 'vlc']
        candidates += [Path(base) / 'VideoLAN' / 'VLC' for base in
                       (os.environ.get('PROGRAMFILES', ''), os.environ.get('PROGRAMFILES(X86)', '')) if base]
        for folder in candidates:
            if (folder / 'libvlc.dll').is_file() and (folder / 'libvlccore.dll').is_file():
                _vlc_dll_directory = os.add_dll_directory(str(folder))
                os.environ['VLC_PLUGIN_PATH'] = str(folder / 'plugins')
                os.environ['PYTHON_VLC_LIB_PATH'] = str(folder / 'libvlc.dll')
                os.environ['PYTHON_VLC_MODULE_PATH'] = str(folder)
                break
    import vlc
    return vlc


class MusicPlayer:
    def __init__(self, on_result, on_state=None, initial_volume=100, on_volume_changed=None):
        self.on_result = on_result
        self.on_state = on_state or (lambda state: None)
        self._lock = threading.Lock()
        self._generation = 0
        self._closed = threading.Event()
        self._commands = queue.Queue()
        self._vlc = self._instance = self._player = None
        self._history = []
        self._index = -1
        self._title = ''
        self._duration = 0
        self._status = 'idle'
        self._ducked = False
        self._volume = max(0, min(100, int(initial_volume)))
        self._on_volume_changed = on_volume_changed
        self._pause_when_ready = False
        self._cache = OrderedDict()
        self._loading_started = None
        self._recommendation = None
        self._waiting_recommendation = False
        self._seen_ids = []
        self._artist = ""
        self._thread = threading.Thread(target=self._run, name='LeytechMusicPlayer', daemon=True)
        self._thread.start()

    def request(self, query, provider='youtube'):
        if not query:
            return '¿Qué canción quieres escuchar?'
        if len(query) > 300:
            return 'Usa un título o un artista más corto.'
        self._search(query)
        return 'Buscando la canción.'

    def _search(self, query, history_index=None):
        with self._lock:
            self._generation += 1
            generation = self._generation
        self._recommendation = None
        self._waiting_recommendation = False
        self._commands.put(('loading', generation, query))
        threading.Thread(target=self._resolve, args=(query, generation, history_index), daemon=True).start()

    def _cached(self, query):
        key = " ".join(query.casefold().split())
        with self._lock:
            item = self._cache.get(key)
            if item is not None and item[0] > time.time():
                self._cache.move_to_end(key)
                return dict(item[1])
            self._cache.pop(key, None)
        return None

    def _remember(self, query, info):
        # Stream links expire. Keep only a small in-memory cache and respect
        # any expiry supplied in the URL; never store credentials on disk.
        expires = time.time() + 600
        try:
            value = parse_qs(urlsplit(info['url']).query).get('expire', [None])[0]
            if value is not None:
                expires = min(expires, float(value) - 60)
        except (ValueError, TypeError):
            return
        if expires <= time.time():
            return
        key = " ".join(query.casefold().split())
        with self._lock:
            self._cache[key] = (expires, dict(info))
            self._cache.move_to_end(key)
            while len(self._cache) > 20:
                self._cache.popitem(last=False)

    def _resolve(self, query, generation, history_index, prepare=False):
        try:
            info = None if prepare else self._cached(query)
            if info is None:
                import yt_dlp
                options = {'format': 'bestaudio/best', 'quiet': True, 'no_warnings': True,
                           'noplaylist': True, 'socket_timeout': 8, 'retries': 1,
                           'extractor_retries': 1, 'logger': QuietExtractorLog()}
                bundled_node = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1])) / 'runtime' / 'node.exe'
                node = str(bundled_node) if bundled_node.is_file() else shutil.which('node')
                if node:
                    options['js_runtimes'] = {'node': {'path': node}}

                # Separate lightweight search from stream extraction so the
                # title appears as soon as the result is found.
                with yt_dlp.YoutubeDL(dict(options, extract_flat=True)) as search:
                    data = search.extract_info(('ytsearch25:' if prepare else 'ytsearch1:') + query, download=False)
                    entry = next((item for item in data.get('entries', []) if item and (not prepare or item.get('id') not in self._seen_ids[-12:])), None)
                if not entry or not self._current(generation):
                    if entry:
                        return
                    raise RuntimeError('Sin resultados de audio.')
                if not prepare:
                    self._commands.put(('extracting', generation, entry.get('title') or query))
                target = entry.get('webpage_url') or entry.get('url')
                if not target:
                    target = 'https://www.youtube.com/watch?v=' + entry['id']
                with yt_dlp.YoutubeDL(options) as downloader:
                    info = downloader.extract_info(target, download=False)
                if not info or not info.get('url'):
                    raise RuntimeError('Sin enlace de audio.')
                if not prepare:
                    self._remember(query, info)
            self._commands.put((('prepared' if prepare else 'resolved'), generation, query, history_index, info))
        except Exception:
            self._commands.put((('recommendation_failed' if prepare else 'failure'), generation,
                'No pude cargar la canción. Revisa tu conexión e inténtalo de nuevo.'))

    def control(self, action, value=None):
        self._commands.put(('control', action, value))

    def set_ducked(self, active):
        self.control('duck', bool(active))

    def cancel_pending(self):
        with self._lock:
            self._generation += 1
        self.control('pause')

    def _current(self, generation):
        with self._lock:
            return generation == self._generation and not self._closed.is_set()

    def _ensure_player(self):
        if self._player is None:
            self._vlc = load_vlc()
            self._instance = self._vlc.Instance('--no-video', '--no-video-title-show', '--quiet')
            if self._instance is None:
                raise RuntimeError('VLC no pudo iniciarse.')
            self._player = self._instance.media_player_new()
            self._player.audio_set_volume(round(self._volume * 0.45) if self._ducked else self._volume)

    def _publish(self):
        position, duration, seekable = 0, self._duration, False
        if self._player is not None and self._status not in ('loading', 'extracting', 'error', 'idle'):
            position = max(0, self._player.get_time())
            duration = max(duration, self._player.get_length())
            seekable = bool(self._player.is_seekable()) and duration > 0
        self.on_state({'type': 'music_state', 'title': self._title, 'status': self._status,
                       'position': position, 'duration': duration, 'seekable': seekable,
                       'previous': self._index > 0, 'next': self._status in ('playing', 'paused', 'opening') or self._index + 1 < len(self._history)})

    def _handle(self, item):
        kind = item[0]
        if kind in ('loading', 'extracting', 'resolved', 'failure', 'prepared', 'recommendation_failed') and not self._current(item[1]):
            return
        if kind == 'prepared':
            self._recommendation = item
            if self._waiting_recommendation:
                self._waiting_recommendation = False
                self._handle(('resolved', item[1], item[2], None, item[4]))
            return
        if kind == 'recommendation_failed':
            self._recommendation = False
            if self._waiting_recommendation:
                self._waiting_recommendation = False
                self._status = 'error'
                self._loading_started = None
                self.on_result('No pude cargar otra canción similar. Pide una canción para continuar.')
                self._publish()
            return
        if kind == 'loading':
            self._pause_when_ready = False
            if self._player is not None:
                self._player.stop()
            self._title, self._duration, self._status = item[2], 0, 'loading'
            self._loading_started = time.monotonic()
        elif kind == 'extracting':
            self._title, self._status = item[2], 'extracting'
        elif kind == 'failure':
            self._status = 'error'
            self._loading_started = None
            self.on_result(item[2])
        elif kind == 'resolved':
            _, _, query, history_index, info = item
            self._ensure_player()
            self._player.stop()
            media = self._instance.media_new(info['url'])
            media.add_option(':no-video')
            media.add_option(':network-caching=1000')
            headers = info.get('http_headers') or {}
            for key, option in [('User-Agent', 'http-user-agent'), ('Referer', 'http-referrer')]:
                if headers.get(key):
                    media.add_option(':' + option + '=' + str(headers[key]).replace('\r', '').replace('\n', ''))
            self._player.set_media(media)
            media.release()
            self._player.audio_set_volume(round(self._volume * 0.45) if self._ducked else self._volume)
            if self._player.play() == -1:
                raise RuntimeError('VLC no pudo reproducir el audio.')
            if history_index is None:
                self._history = self._history[:self._index + 1] + [query]
                self._index = len(self._history) - 1
            else:
                self._index = history_index
            self._title = info.get('title') or query
            self._duration = max(0, int((info.get('duration') or 0) * 1000))
            self._status = 'opening'
            self._loading_started = None
            identifier = info.get('id')
            if identifier:
                self._seen_ids = (self._seen_ids + [identifier])[-80:]
            self._artist = info.get('artist') or info.get('uploader') or info.get('channel') or query
            self._recommendation = None
            self._waiting_recommendation = False
            with self._lock:
                generation = self._generation
            threading.Thread(target=self._resolve, args=(self._artist + ' canciones música', generation, None, True), daemon=True).start()
        elif kind == 'control':
            _, action, value = item
            if action in ('volume_up', 'volume_down', 'volume_set', 'volume_status'):
                current = self._volume
                if action == 'volume_up':
                    self._volume = min(100, current + 10)
                elif action == 'volume_down':
                    self._volume = max(0, current - 10)
                elif action == 'volume_set':
                    self._volume = max(0, min(100, int(value)))
                if self._player is not None:
                    self._player.audio_set_volume(round(self._volume * .45) if self._ducked else self._volume)
                if self._volume != current and self._on_volume_changed is not None:
                    self._on_volume_changed(self._volume)
                self.on_result(f"Volumen de la canción al {self._volume} %.")
            elif action == 'duck':
                self._ducked = bool(value)
                if self._player is not None:
                    self._player.audio_set_volume(round(self._volume * 0.45) if self._ducked else self._volume)
            elif action == 'pause' and self._waiting_recommendation:
                with self._lock:
                    self._generation += 1
                self._waiting_recommendation = False
                self._loading_started = None
                self._status = 'ended'
            elif action in ('pause', 'toggle') and self._status in ('loading', 'extracting', 'opening'):
                self._pause_when_ready = True if action == 'pause' else not self._pause_when_ready
            elif action in ('previous', 'next'):
                index = self._index + (-1 if action == 'previous' else 1)
                if 0 <= index < len(self._history):
                    self._search(self._history[index], index)
                elif action == 'next':
                    self._advance_recommendation()
                elif action == 'previous' and self._player is not None and self._player.is_seekable():
                    self._player.set_time(0)
            elif self._player is not None and self._status not in ('loading', 'extracting', 'error', 'idle'):
                if action == 'toggle':
                    if self._status == 'ended':
                        self._player.stop()
                        self._player.play()
                    else:
                        self._player.set_pause(1 if self._player.is_playing() else 0)
                elif action == 'pause':
                    self._player.set_pause(1)
                elif action in ('seek', 'seek_relative') and self._player.is_seekable():
                    duration = max(self._duration, self._player.get_length())
                    position = max(0, self._player.get_time()) + int(value) if action == 'seek_relative' else int(value)
                    self._player.set_time(max(0, min(position, duration)))
        self._publish()

    def _advance_recommendation(self):
        item = self._recommendation
        if item:
            self._recommendation = None
            self._handle(('resolved', item[1], item[2], None, item[4]))
        elif item is False:
            self._status = 'ended'
        else:
            self._waiting_recommendation = True
            self._status = 'loading'
            self._title = 'Siguiente canción similar'
            self._loading_started = time.monotonic()
            if self._player is not None:
                self._player.stop()

    def _run(self):
        try:
            # Warm up imports while the app starts, rather than charging the
            # first song request for Python's import and extractor startup.
            try:
                import yt_dlp
            except ImportError:
                pass
            while not self._closed.is_set():
                try:
                    item = self._commands.get(timeout=.4)
                    self._handle(item)
                except queue.Empty:
                    if self._status in ('loading', 'extracting') and self._loading_started is not None:
                        if time.monotonic() - self._loading_started > 45:
                            with self._lock:
                                self._generation += 1
                            self._loading_started = None
                            self._status = 'error'
                            self.on_result('La búsqueda tardó demasiado. Revisa tu conexión y vuelve a pedir la canción.')
                            self._publish()
                    if self._player is not None and self._status not in ('loading', 'extracting', 'error', 'idle'):
                        state = str(self._player.get_state()).split('.')[-1].lower()
                        self._status = {'playing':'playing', 'paused':'paused', 'ended':'ended',
                                        'error':'error'}.get(state, 'opening')
                        if state == 'playing' and self._pause_when_ready:
                            self._player.set_pause(1)
                            self._pause_when_ready = False
                        if state == 'ended':
                            self._advance_recommendation()
                        if state == 'error':
                            self.on_result('No pude reproducir esta canción. Prueba otra búsqueda.')
                        self._publish()
                except Exception:
                    self._status = 'error'
                    self.on_result('No pude iniciar el reproductor')
                    self._publish()
        finally:
            if self._player is not None:
                self._player.stop()
                self._player.release()
            if self._instance is not None:
                self._instance.release()

    def stop(self):
        self._closed.set()
        if self._thread is not threading.current_thread():
            self._thread.join(2)
