import ctypes
import subprocess
import sys
from typing import Any, Dict, Optional

from .audio_control import AudioController
from .command_matcher import extract_number
from .logger import logger

SYSTEM_ACTION_MESSAGES = {
    "restart_pc": "Reiniciando la PC.",
    "close_session": "Cerrando la sesión.",
    "switch_user": "Bloqueando el equipo para cambiar de usuario.",
    "suspend_pc": "Suspendiendo la PC.",
}

SYSTEM_ACTION_CONFIRMATIONS = {
    "restart_pc": "¿Confirmas que quieres reiniciar la PC?",
    "close_session": "¿Confirmas que quieres cerrar la sesión?",
    "switch_user": "¿Confirmas que quieres cambiar de usuario? Se bloqueará el equipo.",
    "suspend_pc": "¿Confirmas que quieres suspender la PC?",
}


def execute_system_action(command_name: str) -> None:
    if sys.platform != "win32" or not hasattr(ctypes, "windll"):
        raise RuntimeError("Esta acción del sistema solo está disponible en Windows.")

    if command_name == "restart_pc":
        subprocess.Popen(
            ["shutdown.exe", "/r", "/t", "5"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    elif command_name == "close_session":
        subprocess.Popen(
            ["shutdown.exe", "/l"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    elif command_name == "switch_user":
        if not ctypes.windll.user32.LockWorkStation():
            raise ctypes.WinError()
    elif command_name == "suspend_pc":
        if not ctypes.windll.powrprof.SetSuspendState(False, False, False):
            raise ctypes.WinError()
    else:
        raise ValueError(f"Acción del sistema desconocida: {command_name}")


def clamp_volume(value: Optional[int]) -> int:
    if value is None:
        return 50
    return max(0, min(100, int(value)))


def execute_offline_command(audio: AudioController, command_name: str, value: Optional[int] = None) -> str:
    try:
        if command_name == "volume_up":
            result = audio.increase_volume(10)
            return f"Volumen al {result}%"

        if command_name == "volume_down":
            result = audio.decrease_volume(10)
            return f"Volumen al {result}%"

        if command_name == "volume_set":
            target = clamp_volume(value)
            audio.set_volume(target)
            return f"Volumen establecido en {target}%"

        if command_name == "mute":
            audio.mute(True)
            return "Silencio activado."

        if command_name == "unmute":
            audio.unmute()
            return "Silencio desactivado."

        if command_name == "pause":
            audio.pause()
            return "Solicitud de pausa enviada."

        if command_name == "play_pause":
            audio.play_pause()
            return "Reproducción alternada."

        if command_name == "next_track":
            audio.next_track()
            return "Siguiente pista."

        if command_name == "previous_track":
            audio.previous_track()
            return "Pista anterior."

        if command_name == "status_volume":
            current = audio.get_volume()
            return f"El volumen actual es {current}%"

        return "No entendí la orden."
    except Exception:
        logger.exception("Error ejecutando comando offline.")
        return "Error al ejecutar el comando local."
