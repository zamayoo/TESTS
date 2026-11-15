#!/usr/bin/env python3
"""Headless browser test: ensure the Piper WAV really enters browser playback."""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

url = os.environ.get("TESTS_URL", "https://tests.finoraledger.com").rstrip("/")
Path("monitor-results").mkdir(exist_ok=True)
result = {"check": "Piper browser audio playback", "ok": False, "detail": ""}
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True, args=["--autoplay-policy=no-user-gesture-required"]
        )
        page = browser.new_page(permissions=[])
        page.goto(url + "/?monitor=" + os.environ.get("GITHUB_SHA", "latest"),
                  wait_until="domcontentloaded", timeout=45000)
        page.locator("#testSound").wait_for(state="visible", timeout=20000)
        page.locator("#ttsMode").select_option("server")
        page.evaluate("""() => {
          window.__testsMonitorPlayed = false;
          window.__testsMonitorAudioError = null;
          const audio = document.getElementById('lastAudio');
          audio.addEventListener('playing', () => { window.__testsMonitorPlayed = true; });
          audio.addEventListener('error', () => {
            window.__testsMonitorAudioError = audio.error?.message || 'audio error';
          });
        }""")
        page.locator("#testSound").click()
        page.wait_for_function(
            """() => {
              const a=document.getElementById('lastAudio');
              return a && a.currentSrc.startsWith('blob:') && a.readyState>=2;
            }""",
            timeout=125000
        )
        try:
            page.wait_for_function(
                "() => window.__testsMonitorPlayed && document.getElementById('lastAudio').currentTime > 0.15",
                timeout=12000
            )
        except PlaywrightTimeout:
            # The browser may disallow autoplay after the async server response.
            # Retry using a real click on the native audio player.
            page.locator("#lastAudio").click(position={"x": 22, "y": 19})
            page.wait_for_function(
                "() => window.__testsMonitorPlayed && document.getElementById('lastAudio').currentTime > 0.15",
                timeout=12000
            )
        info = page.locator("#lastAudio").evaluate("""a => ({
          duration: a.duration, currentTime: a.currentTime,
          readyState: a.readyState, error: a.error?.message || null
        })""")
        if info["error"] or not info["duration"] or info["duration"] < 0.5:
            raise AssertionError("Audio invalid: " + json.dumps(info))
        result["ok"] = True
        result["detail"] = "Piper playback event and progressing audio time confirmed"
        browser.close()
except Exception as exc:
    result["detail"] = str(exc)
    print("FAIL Browser speech:", str(exc), flush=True)
    try:
        page.screenshot(path="monitor-results/speech-error.png", full_page=True)
    except Exception:
        pass
else:
    print("PASS Browser speech:", result["detail"], flush=True)
Path("monitor-results/browser-check.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
sys.exit(0 if result["ok"] else 1)
