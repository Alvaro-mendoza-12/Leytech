"""Install official Windows TTS capabilities, without changing voice registry."""
import ctypes
import os
import subprocess
from pathlib import Path
from .voice import list_available_voices


def voice_counts(voices, spanish_only=False):
    import winreg
    counts = {'female': 0, 'male': 0}
    for identifier, _name in voices:
        try:
            prefix, path = identifier.split('\\', 1)
            root = {'HKEY_LOCAL_MACHINE':winreg.HKEY_LOCAL_MACHINE, 'HKEY_CURRENT_USER':winreg.HKEY_CURRENT_USER}[prefix]
            with winreg.OpenKey(root, path + r'\Attributes') as key:
                gender = str(winreg.QueryValueEx(key, 'Gender')[0]).lower()
                if spanish_only:
                    languages = str(winreg.QueryValueEx(key, 'Language')[0]).split(';')
                    if not any((int(language, 16) & 0x3ff) == 0x0a for language in languages):
                        continue
            if gender in counts:
                counts[gender] += 1
        except (OSError, ValueError, KeyError):
            continue
    return counts


def install_windows_voices():
    voices = list_available_voices()
    counts = voice_counts(voices, spanish_only=True)
    if counts['female'] >= 2 and counts['male'] >= 2:
        return voices
    if not ctypes.windll.shell32.IsUserAnAdmin():
        raise RuntimeError('Abre el asistente como administrador para instalar las voces.')
    powershell = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    # Fixed capability names; never interpolate user input into PowerShell.
    for languages in ("@('es-ES','es-MX')", "@('en-US')"):
        command = "$ErrorActionPreference='Stop'; foreach($voiceLanguage in " + languages + ") { foreach($voiceFeature in @('Basic','TextToSpeech')) { $voiceCapability = 'Language.'+$voiceFeature+'~~~'+$voiceLanguage+'~0.0.1.0'; Add-WindowsCapability -Online -Name $voiceCapability -ErrorAction Stop | Out-Null } }"
        result = subprocess.run([str(powershell), '-NoProfile', '-NonInteractive', '-Command', command],
                                creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, timeout=1200)
        if result.returncode:
            raise RuntimeError('Windows no pudo instalar el paquete de voces. Revisa Windows Update y tu conexión, o instala las voces desde los ajustes de voz de Windows.')
        voices = list_available_voices()
        counts = voice_counts(voices)
        if counts['female'] >= 2 and counts['male'] >= 2:
            return voices
    raise RuntimeError('Windows terminó la instalación, pero todavía no ofrece dos voces femeninas y dos masculinas compatibles. Reinicia Windows y actualiza la lista de voces.')
