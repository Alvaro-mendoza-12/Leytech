"""Verify release metadata and download a Windows update on request."""
import base64
import hashlib
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .paths import DATA_DIR, PROJECT_ROOT

FEED_URL = "https://leytech-ochre.vercel.app/asistente-release.json"
PUBLIC_KEY_PATH = PROJECT_ROOT / "update-public.txt"
VERSION_PATH = PROJECT_ROOT / "VERSION"
UPDATE_DIR = DATA_DIR / "updates"


def version_tuple(value: str) -> tuple[int, ...]:
    if not re.fullmatch(r"(?:0|[1-9][0-9]{0,3})(?:\.(?:0|[1-9][0-9]{0,3})){2}", value):
        raise ValueError("Versión inválida.")
    return tuple(map(int, value.split(".")))


@dataclass(frozen=True)
class Release:
    version: str
    url: str
    size: int
    sha256: str

    def __post_init__(self) -> None:
        version_tuple(self.version)
        url = urlsplit(self.url)
        if (url.scheme != "https" or not url.hostname or url.username or url.password or url.fragment
                or any(character.isspace() for character in self.url)
                or not url.path.endswith("/Leytech-Asistente-Windows-x64.exe")):
            raise ValueError("Enlace de actualización inválido.")
        if type(self.size) is not int or not 0 < self.size <= 1024**3:
            raise ValueError("Tamaño de actualización inválido.")
        if not re.fullmatch(r"[a-f0-9]{64}", self.sha256):
            raise ValueError("Huella de actualización inválida.")

    def signed_message(self) -> bytes:
        fields = f"{self.version}\n{self.url}\n{self.size}\n{self.sha256}"
        return b"Leytech Asistente update v1\0" + fields.encode("ascii")


def current_version() -> str:
    return VERSION_PATH.read_text(encoding="ascii").strip()


def check_update() -> Release | None:
    response = httpx.get(FEED_URL, timeout=8)
    response.raise_for_status()
    data = response.json()
    release = Release(data["version"], data["url"], data["size"], data["sha256"])
    public = Ed25519PublicKey.from_public_bytes(bytes.fromhex(PUBLIC_KEY_PATH.read_text(encoding="ascii")))
    try:
        public.verify(base64.b64decode(data["signature"], validate=True), release.signed_message())
    except InvalidSignature:
        raise ValueError("La actualización no está firmada por Leytech.") from None
    if version_tuple(release.version) > version_tuple(current_version()):
        return release
    return None


def clear_previous_installers() -> None:
    installed = version_tuple(current_version())
    for file in UPDATE_DIR.glob("Leytech-Asistente-*.exe"):
        name = re.fullmatch(r"Leytech-Asistente-([0-9.]+)-[a-z0-9_]+\.exe", file.name)
        if name:
            try:
                if version_tuple(name[1]) <= installed:
                    file.unlink()
            except (OSError, ValueError):
                continue


def download_update(release: Release, progress: Callable[[int], None]) -> Path:
    UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    total = 0
    percent = 0
    destination = None
    try:
        with tempfile.NamedTemporaryFile(dir=UPDATE_DIR, delete=False,
                                         prefix=f"Leytech-Asistente-{release.version}-", suffix=".part") as file:
            destination = Path(file.name)
            with httpx.stream("GET", release.url, timeout=20) as response:
                response.raise_for_status()
                for chunk in response.iter_bytes(512 * 1024):
                    total += len(chunk)
                    if total > release.size:
                        raise ValueError("El tamaño de la descarga no coincide.")
                    digest.update(chunk)
                    file.write(chunk)
                    updated = 100 * total // release.size
                    if updated > percent:
                        percent = updated
                        progress(percent)
        if total != release.size or digest.hexdigest() != release.sha256:
            raise ValueError("El instalador está dañado o no corresponde a la actualización.")
        installer = destination.with_suffix(".exe")
        destination.rename(installer)
        destination = installer
        # Preserve Windows' normal SmartScreen handling for an Internet download.
        Path(f"{installer}:Zone.Identifier").write_text("[ZoneTransfer]\nZoneId=3\n", encoding="ascii")
        destination = None
        return installer
    finally:
        if destination is not None:
            destination.unlink(missing_ok=True)
