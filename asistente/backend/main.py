"""Compatibility entry point: launch the complete desktop application."""
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

def main() -> None:
    from frontend.gui import main as run_desktop
    run_desktop()

if __name__ == "__main__":
    main()
