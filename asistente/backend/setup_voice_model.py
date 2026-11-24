import argparse
import shutil
import tempfile
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

MODEL_NAME = "vosk-model-small-es-0.42"
MODEL_URL = f"https://alphacephei.com/vosk/models/{MODEL_NAME}.zip"
MODEL_DIR = Path(__file__).resolve().parent / "models" / MODEL_NAME


def install_model(language="es-ES") -> Path:
    from .recognition_languages import LANGUAGES, model_path
    model_name = LANGUAGES[language][1]
    model_url = f"https://alphacephei.com/vosk/models/{model_name}.zip"
    model_dir = model_path(language)
    if (model_dir / "conf" / "model.conf").is_file():
        return model_dir

    model_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vosk-model-") as temporary_directory:
        archive_path = Path(temporary_directory) / f"{model_name}.zip"
        with urlopen(model_url, timeout=60) as response, archive_path.open("wb") as archive:
            shutil.copyfileobj(response, archive)

        with ZipFile(archive_path) as archive:
            root = Path(temporary_directory).resolve()
            for member in archive.infolist():
                destination = (root / member.filename).resolve()
                if destination != root and root not in destination.parents:
                    raise ValueError(f"Ruta no válida en el modelo Vosk: {member.filename}")
            archive.extractall(root)

        extracted_model = root / model_name
        if not (extracted_model / "conf" / "model.conf").is_file():
            raise RuntimeError("El archivo descargado no contiene un modelo Vosk válido.")
        if model_dir.exists():
            shutil.rmtree(model_dir)
        shutil.move(str(extracted_model), str(model_dir))

    return model_dir


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--language", choices=("es-ES", "en-US"), default="es-ES")
    args = parser.parse_args()
    print(f"Modelo offline instalado en: {install_model(args.language)}")
