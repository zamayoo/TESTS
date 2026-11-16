"""Atomically download Ukrainian TTS v6 model assets into the model volume."""
from pathlib import Path
from urllib.request import urlopen
import os


root = Path(os.environ.get("UKRAINIAN_TTS_CACHE", "/models/ukrainian-tts-v6"))
root.mkdir(parents=True, exist_ok=True)
base = "https://github.com/robinhad/ukrainian-tts/releases/download/v6.0.0/"
minimum_sizes = {
    "model.pth": 440_000_000,
    "config.yaml": 7_000,
    "spk_xvector.ark": 3_000,
    "feats_stats.npz": 1_000,
}

for name, minimum_size in minimum_sizes.items():
    path = root / name
    if path.is_file() and path.stat().st_size >= minimum_size:
        print("Already available:", path)
        continue
    partial = path.with_suffix(path.suffix + ".partial")
    print("Downloading:", name)
    with urlopen(base + name, timeout=180) as response, partial.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    if partial.stat().st_size < minimum_size:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f"Incomplete voice asset: {name}")
    partial.replace(path)
    print("Saved:", path, path.stat().st_size, "bytes")

