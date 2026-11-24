"""Comprobaciones del ejecutable antes de generar el instalador."""
import importlib
from .paths import PROJECT_ROOT, IS_PORTABLE


def verify_resources():
    errors=[]
    try:
        from .music import load_vlc
        load_vlc()
    except (Exception,SystemExit):
        errors.append('module:vlc')
    for name in ('openai','httpx','cryptography','vosk','pyaudio','pyttsx3','comtypes','pycaw','yt_dlp'):
        try:
            importlib.import_module(name)
        except Exception:
            errors.append('module:'+name)
    files=('.assistant_prompt.txt','VERSION','activation-public.txt','activation-url.txt',
           'frontend/assets/leytech.ico','frontend/assets/leytech-dark.ico','frontend/assets/leytech-original.png',
           'frontend/assets/discord-button-32.png','frontend/assets/discord-button-48.png','frontend/assets/discord-button-64.png',
           'vlc/libvlc.dll','vlc/libvlccore.dll',
           'backend/models/vosk-model-small-es-0.42/am/final.mdl',
           'backend/models/vosk-model-small-es-0.42/conf/model.conf',
           'backend/models/vosk-model-small-en-us-0.15/am/final.mdl',
           'backend/models/vosk-model-small-en-us-0.15/conf/model.conf')
    if IS_PORTABLE:
        files += ('runtime/node.exe','portable-mode.txt')
        try:
            importlib.import_module('yt_dlp_ejs')
        except Exception:
            errors.append('module:yt_dlp_ejs')
    else:
        files += ('update-public.txt',)
    for name in files:
        file=PROJECT_ROOT/name
        if not file.is_file() or file.stat().st_size==0:
            errors.append('file:'+name)
    plugins=PROJECT_ROOT/'vlc/plugins'
    if not plugins.is_dir() or not any(plugins.rglob('*.dll')):
        errors.append('plugins')
    return errors
