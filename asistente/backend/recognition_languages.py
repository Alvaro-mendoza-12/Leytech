"""Modelos de reconocimiento instalados; independientes de las voces de Windows."""
from .paths import PROJECT_ROOT

LANGUAGES = {
    'es-ES': ('Español', 'vosk-model-small-es-0.42'),
    'en-US': ('Inglés', 'vosk-model-small-en-us-0.15'),
}


def model_path(language):
    return PROJECT_ROOT / 'backend' / 'models' / LANGUAGES[language][1]


def installed_languages():
    return {code: name for code, (name, _) in LANGUAGES.items()
            if all((model_path(code) / file).is_file()
                   for file in ('conf/model.conf', 'am/final.mdl'))}
