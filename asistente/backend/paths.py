import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "Leytech" / "Asistente"
IS_PORTABLE = bool(getattr(sys, "frozen", False) and (PROJECT_ROOT / "portable-mode.txt").is_file())
SETTINGS_DIR = (DATA_DIR / "portable") if IS_PORTABLE else (DATA_DIR if getattr(sys, "frozen", False) else PROJECT_ROOT)
