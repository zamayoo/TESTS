# Nexus: tests.finoraledger.com

The service includes FastAPI, server-backed email accounts, SQLite, certificates, optional Google OAuth, and an on-premise Ukrainian female voice. No runtime ChatGPT/OpenAI tokens are used. The existing Cloudflare Tunnel → Nginx Proxy Manager routing stays unchanged.

## First setup on LXC 113

```sh
cd /opt/tests
cp .env.example .env
mkdir -p data models
chmod 700 data
chmod 600 .env
python3 server/download_voice.py
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100
```

Before starting, edit `.env` with your own SMTP settings. Use an SMTP account authorized to send from `SMTP_FROM`, with an app-specific password when required. **Never commit `.env` or SMTP passwords to GitHub.**

Required email variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_STARTTLS`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`. `PUBLIC_URL=https://tests.finoraledger.com`, `DATA_PATH=/data/tests.db`, `COOKIE_SECURE=true`, and `PIPER_MODEL=/models/uk_UA-tetiana-high.onnx` are provided in `.env.example`.

Optional Google sign-in: create a Google OAuth web client in Google Cloud, add `https://tests.finoraledger.com/api/google/callback` to authorized redirect URIs, and configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Email/password login does not require Google OAuth.

The primary voice is `robinhad/ukrainian-tts` v6 (MIT). It runs locally, expands numbers and punctuation, and applies automatic Ukrainian lexical stress using a dictionary with a neural fallback. The pinned source revision is recorded in `server/voice-requirements.txt`; its approximately 446 MB model is downloaded into `./models/ukrainian-tts-v6` and never committed. Model: <https://github.com/robinhad/ukrainian-tts>.

`uk_UA-tetiana-high` Piper remains an Apache-2.0 offline fallback while the primary model downloads or if it cannot start. Questions are never sent to a third-party speech API.

## Check

```sh
curl -fsS http://10.242.211.113:8080/api/health
curl -fsS http://10.242.211.113:8080/api/voice/status
curl -I https://tests.finoraledger.com/
```

The first endpoint should return `{"ok":true}`. The voice endpoint should report `ready: true` after download. Check account registration and reset with a real mailbox. Do not mark email functions verified until messages actually arrive.

## Maintenance

```sh
cd /opt/tests
git pull --ff-only origin main
docker compose up -d --build
docker compose restart
docker compose logs --tail=100 -f
```

Volume `./data` holds the persistent SQLite database (including progress and certificates) and is sensitive; back it up. `./models` holds the Piper weights. Neither belongs in Git. Sessions use HTTP-only, Secure, SameSite=Lax cookies and expect HTTPS. Passwords use salted scrypt; reset links expire after one hour, confirmation links after 24 hours, and unsuccessful retakes are blocked for 15 days server-side for authenticated accounts.

## Limitations

- Until SMTP variables are configured, email registration/reset cannot send messages.
- Until Google OAuth credentials are configured, Google sign-in cannot work.
- Until the Ukrainian TTS v6 or fallback Piper weights are installed in `./models`, the server voice reports unavailable. Device speech remains selectable.
- Existing browser-local progress can be exported/imported. The account cabinet syncs after sign-in; existing server progress takes priority when present.
- These are **training certificates**, not official НАДС documents.
