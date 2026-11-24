"""Prueba local del portable, sin tocar datos personales ni usar servicios web."""
import json
from pathlib import Path
import subprocess
import tempfile
import time
import wave
from .paths import PROJECT_ROOT, IS_PORTABLE


def verify_portable():
    if not IS_PORTABLE:
        raise RuntimeError('Esta comprobación requiere la edición portable.')
    from .config import DEFAULT_CONFIG
    if DEFAULT_CONFIG['api_key'] or DEFAULT_CONFIG['openrouter_api_key'] or DEFAULT_CONFIG['ui_theme']!='light':
        raise RuntimeError('Los ajustes iniciales no están limpios.')
    runtime=PROJECT_ROOT/'runtime/node.exe'
    subprocess.run([str(runtime),'--version'],check=True,timeout=15,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
    from . import chat_history
    from .music import load_vlc
    import vosk
    vosk.SetLogLevel(-1)
    model=vosk.Model(str(PROJECT_ROOT/'backend/models/vosk-model-small-es-0.42'))
    recognizer=vosk.KaldiRecognizer(model,16000)
    recognizer.AcceptWaveform(b'\0\0'*16000)
    json.loads(recognizer.FinalResult())
    import comtypes
    comtypes.CoInitialize()
    try:
        from .voice import AsyncWindowsVoice, list_available_voices
        voice=AsyncWindowsVoice(None)
        if not list_available_voices():
            raise RuntimeError('Windows no tiene voces disponibles.')
        voice.setProperty('voice','')
        voice.setProperty('volume',0)
        del voice
    finally:
        comtypes.CoUninitialize()
    with tempfile.TemporaryDirectory() as temporary:
        directory=Path(temporary)
        saved=chat_history.CHAT_HISTORY_PATH
        try:
            chat_history.CHAT_HISTORY_PATH=directory/'history.txt'
            chat_history.append_chat_message('Usuario','Prueba portable')
            chat_history.export_chat_memory(directory/'memory.json')
            chat_history.clear_chat_history()
            chat_history.import_chat_memory(directory/'memory.json')
            if chat_history.load_chat_messages()!=[('Usuario','Prueba portable')]:
                raise RuntimeError('La memoria no funciona correctamente.')
        finally:
            chat_history.CHAT_HISTORY_PATH=saved
        sound=directory/'silence.wav'
        with wave.open(str(sound),'wb') as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(16000)
            stream.writeframes(b'\0\0'*16000*5)
        engine=load_vlc().Instance('--quiet','--no-video','--aout=dummy')
        if engine is None:
            raise RuntimeError('No se pudo iniciar el reproductor.')
        player=engine.media_player_new()
        try:
            player.set_media(engine.media_new(str(sound)))
            if player.play()==-1:
                raise RuntimeError('No se pudo iniciar la reproducción.')
            deadline=time.monotonic()+5
            while player.get_time()<100 and time.monotonic()<deadline:
                time.sleep(.02)
            if not player.is_playing():
                raise RuntimeError('El reproductor no decodifica el audio.')
            player.set_pause(1)
            deadline=time.monotonic()+2
            while 'paused' not in str(player.get_state()).lower() and time.monotonic()<deadline:
                time.sleep(.02)
            if 'paused' not in str(player.get_state()).lower() or not player.is_seekable():
                raise RuntimeError('Los controles de reproducción no están disponibles.')
            player.audio_set_volume(25)
            player.set_time(2000)
            player.set_pause(0)
        finally:
            player.stop()
            player.release()
            engine.release()
    return True
