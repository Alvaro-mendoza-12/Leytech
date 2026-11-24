"""Redeem a code once, then verify its device receipt offline."""
import base64
import binascii
import hashlib
import os
import re
import secrets
import sqlite3
import tempfile
import uuid
import winreg
from pathlib import Path
from contextlib import closing
from urllib.parse import urlsplit

import httpx

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .paths import DATA_DIR, PROJECT_ROOT

PUBLIC_KEY_PATH = PROJECT_ROOT / "activation-public.txt"
ACTIVATION_URL_PATH = PROJECT_ROOT / "activation-url.txt"
LICENSE_PATH = DATA_DIR / "activation.txt"
PENDING_PATH = DATA_DIR / "activation-pending.sqlite3"
DEVICE_PREFIX = "EQ1-"


def device_code() -> str:
    with winreg.OpenKey(
        winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography",
        access=winreg.KEY_READ | winreg.KEY_WOW64_64KEY,
    ) as key:
        guid = uuid.UUID(winreg.QueryValueEx(key, "MachineGuid")[0])
    digest = hashlib.sha256(b"Leytech Asistente device v1\0" + guid.bytes).digest()
    encoded = base64.b32encode(digest[:15]).decode("ascii")
    return DEVICE_PREFIX + "-".join(encoded[i:i + 6] for i in range(0, len(encoded), 6))


def receipt_message(device: str) -> bytes:
    device = device.strip().upper()
    if not re.fullmatch(r"EQ1-(?:[A-Z2-7]{6}-){3}[A-Z2-7]{6}", device):
        raise ValueError("El identificador del equipo no es válido.")
    return b"Leytech Asistente receipt v2\0" + device.encode("ascii")


def read_public_key(path: Path = PUBLIC_KEY_PATH) -> Ed25519PublicKey:
    return Ed25519PublicKey.from_public_bytes(bytes.fromhex(path.read_text(encoding="ascii")))


def verify_receipt(receipt: str, device: str, public_key: Ed25519PublicKey) -> str:
    receipt = receipt.strip()
    if not re.fullmatch(r"LA2-[A-Za-z0-9_-]{86}", receipt):
        raise ValueError("La activación guardada no es válida para esta versión.")
    try:
        signature = base64.urlsafe_b64decode(receipt[4:] + "==")
        public_key.verify(signature, receipt_message(device))
    except (InvalidSignature, binascii.Error):
        raise ValueError("La activación no corresponde a este equipo o a esta edición.") from None
    return receipt


def save_receipt(receipt: str) -> None:
    LICENSE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="ascii", dir=LICENSE_PATH.parent, delete=False,
    ) as file:
        temporary = Path(file.name)
        try:
            file.write(receipt + "\n")
        except BaseException:
            file.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, LICENSE_PATH)
    finally:
        temporary.unlink(missing_ok=True)


def pending_claim(code_hash: str) -> str:
    PENDING_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(PENDING_PATH)) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS pending (code_hash TEXT PRIMARY KEY, claim TEXT NOT NULL)")
        db.execute("INSERT OR IGNORE INTO pending VALUES (?, ?)", (code_hash, secrets.token_hex(32)))
        claim, = db.execute("SELECT claim FROM pending WHERE code_hash=?", (code_hash,)).fetchone()
        return claim


def forget_claim(code_hash: str) -> None:
    try:
        with closing(sqlite3.connect(PENDING_PATH)) as db, db:
            db.execute("DELETE FROM pending WHERE code_hash=?", (code_hash,))
    except sqlite3.Error:
        # The signed receipt has already been saved.
        pass


def redeem(code: str, device: str, public_key: Ed25519PublicKey) -> None:
    normalized = "".join(code.split())
    if not re.fullmatch(r"LT2-[A-Za-z0-9_-]{32}", normalized):
        raise ValueError("Pega un código de activación completo que empiece por LT2-.")

    url = ACTIVATION_URL_PATH.read_text(encoding="ascii").strip()
    parsed = urlsplit(url)
    local = parsed.scheme == "http" and parsed.hostname == "127.0.0.1"
    if (parsed.scheme != "https" and not local or not parsed.hostname or parsed.username
            or parsed.password or parsed.path != "/api/assistant/redeem" or parsed.query or parsed.fragment):
        raise ValueError("El instalador no tiene un servidor de activación válido.")

    code_hash = hashlib.sha256(normalized.encode("ascii")).hexdigest()
    claim = pending_claim(code_hash)
    try:
        response = httpx.post(url, json={"code": normalized, "device": device, "claim": claim}, timeout=12)
    except httpx.RequestError:
        raise ValueError("No se pudo conectar con Leytech. Revisa tu conexión e inténtalo de nuevo.") from None
    if response.status_code == 409:
        forget_claim(code_hash)
        raise ValueError("Este código ya fue utilizado. Contacta a Leytech si necesitas ayuda.")
    if response.status_code == 404:
        forget_claim(code_hash)
        raise ValueError("El código no es válido.")
    if response.status_code == 429:
        raise ValueError("Demasiados intentos. Espera un momento y vuelve a intentarlo.")
    if response.status_code != 200:
        raise ValueError("La activación no está disponible ahora. Inténtalo de nuevo.")
    try:
        receipt = verify_receipt(response.json()["receipt"], device, public_key)
    except (AttributeError, KeyError, TypeError, ValueError):
        raise ValueError("No se pudo comprobar la respuesta de Leytech. Contacta a soporte.") from None
    save_receipt(receipt)
    forget_claim(code_hash)
