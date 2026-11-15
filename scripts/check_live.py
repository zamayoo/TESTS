#!/usr/bin/env python3
"""Public, non-destructive deployment smoke test for TESTS. No credentials required."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request
import wave

BASE = os.environ.get("TESTS_URL", "https://tests.finoraledger.com").rstrip("/")
ROOT = Path(__file__).resolve().parents[1]
WAIT = 420 if os.environ.get("GITHUB_EVENT_NAME") == "push" else 0

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(NoRedirect)
RESULTS = []

def fetch(path, method="GET", data=None, timeout=30):
    headers = {"User-Agent": "TESTS-monitor/1.0", "Cache-Control": "no-cache",
               "Pragma": "no-cache"}
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers, exc.read(3000)

def check(name, fn):
    try:
        message = fn()
        print("PASS", name, "-", message, flush=True)
        RESULTS.append({"check": name, "ok": True, "detail": str(message)})
    except Exception as exc:
        print("FAIL", name, "-", str(exc), flush=True)
        RESULTS.append({"check": name, "ok": False, "detail": str(exc)})

def deployment_ready():
    status, _, html = fetch("/")
    if status != 200:
        raise RuntimeError("Homepage HTTP " + str(status))
    text = html.decode("utf-8")
    local = (ROOT / "dist/index.html").read_text(encoding="utf-8")
    expected = re.search(r'app\\.js\\?v=\\d+', local)
    if not expected or expected.group(0) not in text:
        raise RuntimeError("Homepage is not serving the current app.js version")
    for path in ("app.js", "account.js", "privacy.html"):
        code, _, remote = fetch("/" + path + "?monitor=" + os.environ.get("GITHUB_SHA", "latest"))
        if code != 200:
            raise RuntimeError(path + " HTTP " + str(code))
        local_bytes = (ROOT / "dist" / path).read_bytes()
        if hashlib.sha256(remote).digest() != hashlib.sha256(local_bytes).digest():
            raise RuntimeError(path + " differs from checked-out main (deployment or cache lag)")
    return "Homepage and JS/privacy assets match GitHub main"

def require_json(path, status_expected=200):
    status, _, body = fetch(path)
    if status != status_expected:
        raise RuntimeError(path + ": HTTP " + str(status) + ", expected " + str(status_expected))
    return json.loads(body)

def check_api():
    obj = require_json("/api/health")
    if obj.get("ok") is not True:
        raise RuntimeError("API health is not OK")
    return "/api/health OK"

def check_voice_status():
    obj = require_json("/api/voice/status")
    if obj.get("ready") is not True:
        raise RuntimeError("Piper voice not ready: " + repr(obj))
    return obj.get("name", "Piper ready")

def check_audio():
    status, headers, body = fetch(
        "/api/voice", method="POST",
        data={"text": "Вітаю! Це автоматична перевірка українського голосу Тетяна."},
        timeout=115,
    )
    if status != 200:
        raise RuntimeError("Voice HTTP " + str(status) + ": " + body[:250].decode("utf-8", "replace"))
    if not body.startswith(b"RIFF") or body[8:12] != b"WAVE":
        raise RuntimeError("Voice did not return valid WAV header")
    with wave.open(io.BytesIO(body)) as wav:
        length = wav.getnframes() / wav.getframerate()
    if not 0.5 <= length <= 120:
        raise RuntimeError("Unexpected WAV length " + str(length))
    return "Valid WAV, %.1f seconds (%d bytes)" % (length, len(body))

def check_anonymous_auth():
    status, _, _ = fetch("/api/me")
    if status != 401:
        raise RuntimeError("Anonymous /api/me should return 401, got " + str(status))
    return "Anonymous user cannot access private profile"

def check_google_start():
    status, headers, _ = fetch("/api/google/start")
    location = headers.get("Location", "")
    if status not in (302, 303, 307) or not location.startswith("https://accounts.google.com/"):
        raise RuntimeError("Google OAuth redirect invalid: HTTP " + str(status))
    if "google_oauth_state" not in headers.get("Set-Cookie", ""):
        raise RuntimeError("OAuth state cookie missing")
    return "Google login redirects securely to Google (no account login attempted)"

def check_privacy():
    status, _, body = fetch("/privacy.html")
    if status != 200 or "Політика конфіденційності" not in body.decode("utf-8"):
        raise RuntimeError("Privacy page not accessible")
    return "Privacy policy available"

deadline = time.monotonic() + WAIT
while True:
    try:
        message = deployment_ready()
        check("Deployed version", lambda: message)
        break
    except Exception as exc:
        if time.monotonic() >= deadline:
            check("Deployed version", lambda: (_ for _ in ()).throw(exc))
            break
        print("Waiting for Nexus deployment:", str(exc), flush=True)
        time.sleep(15)

check("Backend API", check_api)
check("Piper installed", check_voice_status)
check("Piper synthesizes real WAV", check_audio)
check("Private profile protected", check_anonymous_auth)
check("Google OAuth starting flow", check_google_start)
check("Privacy", check_privacy)

report = {"url": BASE, "commit": os.environ.get("GITHUB_SHA", "unknown"),
          "checks": RESULTS, "passed": all(x["ok"] for x in RESULTS)}
Path("monitor-results").mkdir(exist_ok=True)
Path("monitor-results/api-check.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
sys.exit(0 if report["passed"] else 1)
