"""Download freely licensed Piper Ukrainian female voice (114 MB)."""
from pathlib import Path
from urllib.request import urlopen
import os

root = Path(os.environ.get('VOICE_DIR', 'models'))
root.mkdir(parents=True, exist_ok=True)
base = 'https://huggingface.co/RomanStasyshyn/uk_UA-tetiana-high/resolve/main/'
for remote, local in [('tetiana.onnx', 'uk_UA-tetiana-high.onnx'),
                      ('tetiana.onnx.json', 'uk_UA-tetiana-high.onnx.json')]:
    path = root / local
    if path.exists() and path.stat().st_size > 1000:
        print('Already available:', path)
        continue
    print('Downloading:', remote)
    with urlopen(base+remote, timeout=120) as response, open(str(path)+'.partial', 'wb') as output:
        while chunk := response.read(1024*1024):
            output.write(chunk)
    Path(str(path)+'.partial').replace(path)
    print('Saved:', path, path.stat().st_size, 'bytes')
