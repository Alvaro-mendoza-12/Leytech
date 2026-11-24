"""Conservative multi-command parsing, without an AI or fuzzy boundaries."""
import re
from .command_matcher import normalize_text, match_command, extract_number, NUMBER_WORDS
from .music import parse_music_command

TERMINAL_COMMANDS = {'restart_assistant','restart_pc','close_program','close_session','switch_user','suspend_pc'}
VOLUME = re.compile(r'(?:(?:sube|subir|baja|bajar|aumenta|aumentar|disminuye|disminuir|reduce|reducir|establece|establecer|pon|poner|fija|fijar|ajusta|ajustar) (?:el )?)?volumen(?: (?:de la|del|de) (?:voz|asistente|cancion|musica|reproductor|escritorio|pc|ordenador))?(?: del asistente)?(?: (?:a|al|en) ([a-z0-9 ]+))?')
SIMPLE = re.compile(r'(?:pausa|pausar|reanuda|reanudar|continua|continuar|adelanta|adelantar|retrocede|retroceder|avanza|avanzar)(?: (?:la )?(?:cancion|musica|pista|reproduccion))?|(?:sube|baja|aumenta|disminuye) (?:el )?volumen|(?:silencia|silenciar)(?: (?:el )?(?:audio|sonido))?|(?:activa|activar) (?:el )?sonido|(?:cual es|dime) el volumen(?: actual)?')
CONNECTOR = re.compile(r'\s+(?:y(?:\s+luego)?|luego|despu[eé]s|adem[aá]s|tambi[eé]n)\s+|\s*;\s*|,\s*', re.I)
QUOTED = re.compile(r'"[^"\n]*"|“[^”\n]*”|(?<!\w)\x27[^\x27\n]*\x27(?!\w)')


def known_command(text):
    cleaned = normalize_text(text)
    if cleaned.startswith('reproduce '):
        song = parse_music_command(text)
        return bool(song and song['query'])
    if cleaned in {'reiniciate','reinicia el asistente','reiniciar el asistente','cierra el programa','cierra el asistente','reinicia la pc','reinicia pc','reiniciar pc','cerrar sesion','cierra sesion','suspende la pc','suspender pc','cambia de usuario'}:
        return True
    if re.match(r'^(?:di|repite)(?:\s|$)', cleaned):
        return True
    volume = VOLUME.fullmatch(cleaned)
    if volume:
        tail = volume.group(1)
        if tail is not None:
            number = re.sub(r' por ciento$', '', tail)
            words = number.split()
            valid = (number.isdigit() or number in NUMBER_WORDS or
                     (len(words) == 3 and words[1] == 'y' and
                      NUMBER_WORDS.get(words[0], 0) in range(20, 100, 10) and
                      1 <= NUMBER_WORDS.get(words[2], 0) <= 9))
            if not valid or extract_number(number) is None:
                return False
        return match_command(text) is not None
    return bool(SIMPLE.fullmatch(cleaned) and match_command(text))


def split_commands(text):
    """Return one untouched utterance or a fully validated list of 2–3 orders.

    Quote song names containing command-like conjunctions. A repeat/di command
    owns the rest of its text, even if it contains command words.
    """
    text = text.strip()
    if re.match(r'^(?:repite|di)(?=$|[\s,:;])', text, re.I):
        return [text]
    masked = list(text)
    for match in QUOTED.finditer(text):
        masked[match.start():match.end()] = '_' * (match.end() - match.start())
    masked = ''.join(masked)
    parts = []
    start = 0
    for separator in CONNECTOR.finditer(masked):
        right = text[separator.end():]
        # Only split before a supported command prefix, never an arbitrary
        # occurrence of "y", an artist name, or "treinta y cinco".
        prefix = normalize_text(right)
        if not re.match(r'^(?:reproduce|repite|di|sube|subir|baja|bajar|aumenta|aumentar|disminuye|disminuir|establece|establecer|pon|poner|fija|fijar|ajusta|ajustar|pausa|pausar|reanuda|reanudar|continua|continuar|adelanta|retrocede|avanza|silencia|silenciar|activa|activar|reiniciate|reinicia|reiniciar|cierra|cerrar|suspende|suspender|cambia)(?:\s|$)', prefix):
            continue
        left = text[start:separator.start()].strip(' ,;')
        if not known_command(left):
            continue
        parts.append(left)
        start = separator.end()
        if re.match(r'^(?:repite|di)(?:\s|$)', prefix):
            break
    if not parts:
        return [text]
    parts.append(text[start:].strip(' ,;'))
    if len(parts) > 3:
        raise ValueError('Puedes dar hasta tres órdenes por frase. No ejecuté ninguna; divide la petición.')
    if not all(known_command(part) for part in parts):
        raise ValueError('No pude separar todas las órdenes con seguridad. Dímelas por separado; no ejecuté ninguna.')
    if sum(parse_music_command(part) is not None for part in parts) > 1:
        raise ValueError('Pide solo una canción por frase; puedes combinarla con dos ajustes o controles.')
    for part in parts:
        command = match_command(part) if parse_music_command(part) is None else None
        if command and command['command'] in TERMINAL_COMMANDS:
            raise ValueError('Pide el reinicio o cierre por separado para no interrumpir las demás órdenes.')
    return parts
