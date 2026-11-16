"""Modern Ukrainian speech synthesis with automatic lexical stress.

The primary engine is robinhad/ukrainian-tts v6 (MIT).  Piper remains an
offline fallback so a model download or cold start never removes speech from
the site.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
import os
import re
import threading
import unicodedata


MODEL_FILES = ("model.pth", "config.yaml", "spk_xvector.ark", "feats_stats.npz")
MODEL_DIR = Path(os.getenv("UKRAINIAN_TTS_CACHE", "/models/ukrainian-tts-v6"))
_engine = None
_engine_lock = threading.Lock()


def model_ready() -> bool:
    return all((MODEL_DIR / name).is_file() for name in MODEL_FILES)


def prepare_text(text: str) -> str:
    """Make test wording predictable before the model's own normalizer.

    Ukrainian TTS then expands numbers/currencies and applies dictionary plus
    neural stress.  This layer only removes UI punctuation that otherwise
    produces abrupt pauses or is read as a stray symbol.
    """
    replacements = {
        "№": " номер ", "%": " відсотків ", "&": " і ",
        "•": ", ", "·": ", ", "→": ", ", "←": ", ",
        "\n": ". ", "\r": " ",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s*[/|]\s*", " або ", text)
    text = re.sub(r"\s*[:;]\s*", ", ", text)
    text = re.sub(r",\s*\.", ".", text)
    text = re.sub(r"([!?.,]){2,}", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    if text and text[-1] not in ".!?":
        text += "."
    return text


def _get_engine():
    global _engine
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is None:
            if not model_ready():
                raise RuntimeError("modern Ukrainian voice is still downloading")
            from ukrainian_tts.tts import TTS
            _engine = TTS(cache_folder=str(MODEL_DIR), device="cpu")
    return _engine


def synthesize(text: str) -> tuple[bytes, str]:
    """Return WAV bytes and the stress-annotated text used for synthesis."""
    from ukrainian_tts.tts import Voices, Stress

    output = BytesIO()
    output, accented = _get_engine().tts(
        prepare_text(text), Voices.Tetiana.value, Stress.Dictionary.value, output
    )
    return output.getvalue(), accented

