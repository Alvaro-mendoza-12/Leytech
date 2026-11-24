import re
import threading
import json
import os
import tempfile
from pathlib import Path
from datetime import datetime
from .paths import SETTINGS_DIR

CHAT_HISTORY_PATH = SETTINGS_DIR / "logs" / "chat_history.txt"
_history_lock = threading.Lock()
_MESSAGE_PATTERN = re.compile(r"^\[[^\]]+\] (Usuario|Computadora): (.*)$")


def load_chat_messages() -> list[tuple[str, str]]:
    if not CHAT_HISTORY_PATH.exists():
        return []

    messages: list[tuple[str, str]] = []
    with _history_lock:
        for line in CHAT_HISTORY_PATH.read_text(encoding="utf-8").splitlines():
            match = _MESSAGE_PATTERN.match(line)
            if match:
                messages.append((match.group(1), match.group(2)))
            elif messages:
                role, text = messages[-1]
                messages[-1] = (role, f"{text}\n{line}")
    return messages


def append_chat_message(role: str, text: str) -> None:
    timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
    safe_text = text.replace("\r\n", "\n").replace("\r", "\n")
    with _history_lock:
        CHAT_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        with CHAT_HISTORY_PATH.open("a", encoding="utf-8", newline="\n") as history:
            history.write(f"[{timestamp}] {role}: {safe_text}\n")


def clear_chat_history() -> None:
    """Forget persisted memory; callers serialize this with conversation requests."""
    with _history_lock:
        CHAT_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        CHAT_HISTORY_PATH.write_text("", encoding="utf-8")


def _atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=path.parent,delete=False,newline='\n') as stream:
            temporary = Path(stream.name)
            stream.write(text)
        os.replace(temporary,path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def export_chat_memory(destination):
    destination = Path(destination).resolve()
    if destination == CHAT_HISTORY_PATH.resolve():
        raise ValueError('Elige un archivo distinto del historial activo.')
    messages = load_chat_messages()
    payload = {'format':'leytech-memory','version':1,'messages':[{'role':role,'text':text} for role,text in messages]}
    _atomic_write(destination,json.dumps(payload,ensure_ascii=False,indent=2))
    return len(messages)


def import_chat_memory(source):
    source = Path(source)
    if source.stat().st_size > 5*1024*1024:
        raise ValueError('El archivo de memoria supera los 5 MB.')
    try:
        with source.open('rb') as stream:
            raw = stream.read(5*1024*1024+1)
        if len(raw)>5*1024*1024:
            raise ValueError('El archivo de memoria supera los 5 MB.')
        payload = json.loads(raw.decode('utf-8-sig'))
    except (UnicodeError,json.JSONDecodeError):
        raise ValueError('El archivo no es una memoria JSON válida de Leytech.') from None
    if not isinstance(payload,dict) or payload.get('format')!='leytech-memory' or type(payload.get('version')) is not int or payload['version']!=1:
        raise ValueError('El formato de memoria no es compatible.')
    rows = payload.get('messages')
    if not isinstance(rows,list) or len(rows)>10000:
        raise ValueError('La memoria debe contener una lista de hasta 10 000 mensajes.')
    timestamp = datetime.now().astimezone().isoformat(timespec='seconds')
    lines = []
    for row in rows:
        if not isinstance(row,dict) or row.get('role') not in ('Usuario','Computadora') or not isinstance(row.get('text'),str):
            raise ValueError('La memoria contiene un mensaje no válido.')
        text = row['text'].replace('\r\n','\n').replace('\r','\n')
        if '\x00' in text or len(text)>50000:
            raise ValueError('La memoria contiene un mensaje demasiado largo o no válido.')
        # Un texto pegado no debe convertirse en una cabecera de historial.
        text = re.sub(r'\n(?=\[[^\]]+\] (?:Usuario|Computadora): )','\n ',text)
        lines.append(f'[{timestamp}] {row["role"]}: {text}\n')
    with _history_lock:
        _atomic_write(CHAT_HISTORY_PATH,''.join(lines))
    return len(rows)


def recent_chat_messages(messages, limit=12, max_chars=12000):
    selected = []
    remaining = max_chars
    for role, text in reversed(messages[-limit:]):
        if remaining <= 0:
            break
        content = text[-min(remaining, 2000):]
        selected.append({"role": "user" if role == "Usuario" else "assistant", "content": content})
        remaining -= len(content)
    return list(reversed(selected))


def search_chat_messages(messages, query: str, limit=6, max_chars=6000):
    """Rank literal words locally; only bounded matching excerpts leave the PC."""
    import unicodedata
    def words(text):
        normalized = unicodedata.normalize("NFKD", text.casefold())
        normalized = "".join(c for c in normalized if not unicodedata.combining(c))
        return set(re.findall(r"[a-z0-9]{3,}", normalized))
    stop = set("que como cuando donde para por del las los una uno con mis tus recuerdas dije hablamos sobre antes".split())
    terms = words(query[:500]) - stop
    if not terms:
        return []
    ranked = sorted(((len(terms & words(text)), i) for i, (_, text) in enumerate(messages)), reverse=True)
    indices = set()
    for score, index in ranked:
        if not score or len(indices) >= limit:
            break
        indices.add(index)
        if index + 1 < len(messages) and len(indices) < limit:
            indices.add(index + 1)
    results = []
    remaining = max_chars
    for index in sorted(indices):
        role, text = messages[index]
        excerpt = text[:min(1500, remaining)]
        if not excerpt:
            break
        results.append({"role": role, "text": excerpt})
        remaining -= len(excerpt)
    return results
