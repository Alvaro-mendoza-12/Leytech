import importlib.metadata
import shutil
import sys
from pathlib import Path


def collect(destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for package in importlib.metadata.distributions():
        for entry in package.files or ():
            if not any(part.endswith(".dist-info") for part in entry.parts):
                continue
            if not entry.name.upper().startswith(("LICENSE", "COPYING", "NOTICE", "AUTHORS")):
                continue
            target = destination.joinpath(*entry.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(package.locate_file(entry), target)

    base = Path(sys.base_prefix)
    for name in ("LICENSE", "LICENSE.txt"):
        source = base / name
        if source.is_file():
            shutil.copyfile(source, destination / "Python-LICENSE.txt")
            break
    for source in (base / "tcl").glob("*/license.terms"):
        shutil.copyfile(source, destination / f"{source.parent.name}-license.txt")


if __name__ == "__main__":
    collect(Path(sys.argv[1]))
