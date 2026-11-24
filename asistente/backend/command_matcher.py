import re
from typing import Any, Dict, Optional

from .commands import COMMANDS, WORD_ALIASES

NUMBER_WORDS = {
    "cero": 0,
    "uno": 1,
    "dos": 2,
    "tres": 3,
    "cuatro": 4,
    "cinco": 5,
    "seis": 6,
    "siete": 7,
    "ocho": 8,
    "nueve": 9,
    "diez": 10,
    "veinte": 20,
    "treinta": 30,
    "cuarenta": 40,
    "cincuenta": 50,
    "sesenta": 60,
    "setenta": 70,
    "ochenta": 80,
    "noventa": 90,
    "cien": 100,
}

NUMBER_WORDS.update({"once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19})
NUMBER_WORDS.update({"veinti" + word: 20 + value for word, value in list(NUMBER_WORDS.items()) if 1 <= value <= 9})

ACTION_PHRASES = {
    "play_pause": (
        "reanuda la cancion",
        "reanudar la cancion",
        "reanuda cancion",
        "reanudar cancion",
        "pausa la cancion",
        "pausar la cancion",
        "reanuda la musica",
        "reanudar la musica",
    ),
    "close_program": (
        "cierra el programa",
        "cerrar el programa",
        "cierra programa",
        "cierra la computadora",
        "cierra el asistente",
    ),
    "restart_pc": (
        "reiniciar pc",
        "reinicia pc",
        "reiniciar la pc",
        "reinicia la pc",
        "reiniciar computadora",
        "reinicia la computadora",
        "reinicia el pc",
    ),
    "close_session": (
        "cerrar sesion",
        "cierra sesion",
        "cerrar la sesion",
        "cierra la sesion",
    ),
    "switch_user": (
        "cambiar de usuario",
        "cambia de usuario",
        "cambiar usuario",
        "cambia usuario",
    ),
    "suspend_pc": (
        "suspender pc",
        "suspende pc",
        "suspender la pc",
        "suspende la pc",
        "suspender computadora",
        "suspende la computadora",
    ),
}


def normalize_text(text: str) -> str:
    if not text:
        return ""
    normalized = text.lower().strip()
    normalized = normalized.replace("á", "a")
    normalized = normalized.replace("é", "e")
    normalized = normalized.replace("í", "i")
    normalized = normalized.replace("ó", "o")
    normalized = normalized.replace("ú", "u")
    normalized = normalized.replace("ü", "u")
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def tokenize(text: str):
    if not text:
        return []
    return [token for token in normalize_text(text).split() if token]


def extract_number(text: str) -> Optional[int]:
    cleaned = normalize_text(text)
    digits = re.findall(r"\d+", cleaned)
    if digits:
        return int(digits[0])

    tokens = cleaned.split()
    for index, token in enumerate(tokens):
        if token in NUMBER_WORDS:
            value = NUMBER_WORDS[token]
            if 20 <= value <= 90 and value % 10 == 0 and index + 2 < len(tokens) and tokens[index + 1] == "y":
                unit = NUMBER_WORDS.get(tokens[index + 2], 0)
                if 1 <= unit <= 9:
                    return value + unit
            return value
        if token.endswith("y") and token[:-1] in NUMBER_WORDS:
            return NUMBER_WORDS[token[:-1]]

    # Handles numbers like "veinticinco" -> 25
    combined = "".join(tokens)
    for word, number in NUMBER_WORDS.items():
        if combined == word:
            return number
    return None


def _resolve_alias(token: str) -> str:
    return WORD_ALIASES.get(token, token)


def score_command(command_name: str, text: str) -> int:
    spec = COMMANDS[command_name]
    tokens = tokenize(text)
    score = 0
    for token in tokens:
        resolved = _resolve_alias(token)
        if resolved in spec["keywords"]:
            score += 1
        elif token in spec["keywords"]:
            score += 1
    if spec.get("requires_value") and extract_number(text) is not None:
        score += 1
    return score


def match_command(text: str) -> Optional[Dict[str, Any]]:
    cleaned = normalize_text(text)
    if not cleaned:
        return None

    if re.fullmatch(r"(?:pausa|pausar)(?: (?:la )?(?:musica|cancion|reproduccion))?", cleaned):
        return {"command": "pause", "score": 100, "value": None}

    if cleaned in {"reiniciate", "reinicia el asistente", "reiniciar el asistente"}:
        return {"command": "restart_assistant", "score": 100, "value": None}
    words = set(cleaned.split())
    if "volumen" in words and words.intersection({"cancion", "musica", "reproductor"}):
        value = extract_number(cleaned)
        if words.intersection({"sube", "subir", "aumenta", "aumentar"}):
            action = "music_volume_set" if value is not None else "music_volume_up"
        elif words.intersection({"baja", "bajar", "disminuye", "disminuir"}):
            action = "music_volume_set" if value is not None else "music_volume_down"
        elif value is not None:
            action = "music_volume_set"
        else:
            action = "music_volume_status"
        return {"command": action, "score": 100, "value": value}

    for command_name, phrases in ACTION_PHRASES.items():
        if any(re.search(rf"(?:^|\s){re.escape(phrase)}(?:$|\s)", cleaned) for phrase in phrases):
            return {"command": command_name, "score": 100, "value": None}

    best_name: Optional[str] = None
    best_score = 0
    best_value = None

    for command_name, spec in COMMANDS.items():
        score = score_command(command_name, cleaned)
        if score >= spec["minimum"]:
            value = extract_number(cleaned) if spec.get("requires_value") else None
            if score > best_score:
                best_score = score
                best_name = command_name
                best_value = value

    if best_name is None:
        return None

    return {
        "command": best_name,
        "score": best_score,
        "value": best_value,
    }
