import json
import os
import tempfile
import threading
from functools import wraps
from pathlib import Path
from typing import Any, Dict

from .paths import SETTINGS_DIR
from .hotkeys import DEFAULT_HOTKEYS, validate_bindings

CONFIG_PATH = SETTINGS_DIR / "config" / "config.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "api_key": "",
    "ai_provider": "openai",
    "openrouter_api_key": "",
    "openai_model": "gpt-4o-mini",
    "openrouter_model": "openrouter/free",
    "username": "Usuario",
    "wake_word": "Computadora",
    "voice_speed": "normal",
    "voice_volume": 100,
    "music_volume": 100,
    "voice_id": "",
    "ui_theme": "light",
    "show_chat_history": True,
    "startup_enabled": False,
    "hotkeys": DEFAULT_HOTKEYS.copy(),
    "microphone_enabled": True,
    "microphone_device_index": None,
    "voice_recognition_mode": "offline",
    "recognition_english_music": True,
    "microphone_sensitivity": "auto",
    "microphone_manual_threshold": 500,
    "microphone_dynamic_adjustment": True,
}


_config_lock = threading.RLock()


def _serialized(function):
    @wraps(function)
    def run(*args, **kwargs):
        with _config_lock:
            return function(*args, **kwargs)
    return run


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


@_serialized
def load_config() -> Dict[str, Any]:
    _ensure_parent(CONFIG_PATH)
    if not CONFIG_PATH.exists():
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG.copy()

    try:
        raw = CONFIG_PATH.read_text(encoding="utf-8")
        data = json.loads(raw) if raw.strip() else {}
    except (json.JSONDecodeError, OSError):
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG.copy()

    merged = DEFAULT_CONFIG.copy()
    merged.update(data)
    try:
        merged["hotkeys"] = validate_bindings(merged.get("hotkeys", {}))
    except ValueError:
        merged["hotkeys"] = DEFAULT_HOTKEYS.copy()
    merged.pop("key_bindings", None)
    merged.pop("assistant_prompt", None)
    return merged


@_serialized
def save_config(data: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_parent(CONFIG_PATH)
    payload = DEFAULT_CONFIG.copy()
    payload.update(data)
    payload["hotkeys"] = validate_bindings(payload.get("hotkeys", {}))
    payload.pop("key_bindings", None)
    payload.pop("assistant_prompt", None)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=CONFIG_PATH.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, indent=2)
        os.replace(temporary, CONFIG_PATH)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return payload


@_serialized
def update_config_values(values):
    current = load_config()
    current.update(values)
    return save_config(current)


def normalize_voice_speed(value) -> int:
    """Read saved slider values and the legacy named speed settings."""
    if isinstance(value, str):
        rates = {"normal": 180, "fast": 220, "rápida": 220, "slow": 100, "lento": 100}
        if value.strip().lower() not in rates:
            raise ValueError("La velocidad de voz no es válida.")
        return rates[value.strip().lower()]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 100 <= value <= 260:
        raise ValueError("La velocidad de voz debe estar entre 100 y 260.")
    return round(value)
