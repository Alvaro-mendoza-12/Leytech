import sys

STARTUP_REGISTRY_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
STARTUP_VALUE_NAME = "ComputadoraAssistant"


def remove_startup_entry() -> None:
    if sys.platform != "win32":
        return

    import winreg

    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, STARTUP_REGISTRY_KEY,
                           0, winreg.KEY_SET_VALUE) as startup_key:
        try:
            winreg.DeleteValue(startup_key, STARTUP_VALUE_NAME)
        except FileNotFoundError:
            pass


def configure_startup(enabled: bool) -> None:
    """Opt-in current-user startup for packaged builds only."""
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return
    if not enabled:
        remove_startup_entry()
        return
    import winreg
    import subprocess
    command = subprocess.list2cmdline([sys.executable])
    if len(command) > 260:
        raise RuntimeError("La ruta del ejecutable es demasiado larga para el inicio automático.")
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, STARTUP_REGISTRY_KEY, 0,
                           winreg.KEY_SET_VALUE) as startup_key:
        winreg.SetValueEx(startup_key, STARTUP_VALUE_NAME, 0, winreg.REG_SZ, command)
