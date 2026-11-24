"""Prepare the updater public key and sign the exact installer uploaded to Leytech."""
import argparse
import base64
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

import win32crypt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.updates import Release, current_version

KEY = Path(os.environ["LOCALAPPDATA"]) / "Leytech" / "ReleaseSecrets" / "assistant-update.dpapi"


def signing_key(create: bool) -> Ed25519PrivateKey:
    try:
        protected = KEY.read_bytes()
    except FileNotFoundError:
        if not create:
            raise
        key = Ed25519PrivateKey.generate()
        protected = win32crypt.CryptProtectData(key.private_bytes_raw(), "Actualizaciones Leytech", None, None, None, 1)
        KEY.parent.mkdir(parents=True, exist_ok=True)
        with KEY.open("xb") as file:
            file.write(protected)
        return key
    _, private = win32crypt.CryptUnprotectData(protected, None, None, None, 1)
    return Ed25519PrivateKey.from_private_bytes(private)


def file_details(path: Path) -> tuple[int, str]:
    with path.open("rb") as file:
        return os.fstat(file.fileno()).st_size, hashlib.file_digest(file, "sha256").hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    public = commands.add_parser("public-key")
    public.add_argument("output", type=Path)
    manifest = commands.add_parser("manifest")
    manifest.add_argument("installer", type=Path)
    manifest.add_argument("url")
    manifest.add_argument("output", type=Path)
    manifest.add_argument("--windows-installer", nargs=2, metavar=("MSI", "URL"), required=True)
    args = parser.parse_args()
    key = signing_key(create=args.command == "public-key")
    if args.command == "public-key":
        args.output.write_text(key.public_key().public_bytes_raw().hex() + "\n", encoding="ascii")
        return

    size, digest = file_details(args.installer)
    release = Release(current_version(), args.url, size, digest)
    signature = key.sign(release.signed_message())
    msi, msi_url = args.windows_installer
    parsed = urlsplit(msi_url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.fragment or not parsed.path.endswith("/Leytech-Asistente-Windows-x64.msi")):
        parser.error("Se necesita la URL HTTPS del paquete MSI.")
    msi_size, msi_hash = file_details(Path(msi))
    data = dict(vars(release), signature=base64.b64encode(signature).decode("ascii"),
                windows_installer={"url": msi_url, "size": msi_size, "sha256": msi_hash})
    args.output.write_text(json.dumps(data, indent=2) + "\n", encoding="ascii")


if __name__ == "__main__":
    main()
