"""Self-hosted email accounts, progress, certificates and Ukrainian Piper speech."""
import asyncio
import base64
import hashlib
import hmac
import json
import io
import re
import os
import secrets
import smtplib
import sqlite3
import subprocess
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import urlencode

import httpx
import qrcode
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

BASE = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv('DATA_PATH', '/data/tests.db'))
SITE_URL = os.getenv('PUBLIC_URL', 'https://tests.finoraledger.com').rstrip('/')
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'true').lower() == 'true'
DEMO_CERTIFICATE_EMAIL = os.getenv('DEMO_CERTIFICATE_EMAIL', 'zamayoo@gmail.com').strip().lower()
SESSION_DAYS = 30
MAX_BODY = 160_000
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
questions = {q['id']: q for q in json.loads((BASE / 'dist/questions.json').read_text())['questions']}
speech_lock = asyncio.Semaphore(1)
limits = {}


def now():
    return int(time.time())


@contextmanager
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA journal_mode=WAL')
    try:
        yield con
        con.commit()
    finally:
        con.close()


with db() as con:
    con.executescript('''
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL,
        password_salt TEXT, password_hash TEXT, display_name TEXT NOT NULL DEFAULT '',
        google_sub TEXT UNIQUE, verified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tokens (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
        kind TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS certificates (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL,
        score INTEGER NOT NULL, correct INTEGER NOT NULL, passed INTEGER NOT NULL,
        created_at INTEGER NOT NULL, next_allowed_at INTEGER);
      CREATE INDEX IF NOT EXISTS certificates_user ON certificates(user_id, created_at);
      CREATE TABLE IF NOT EXISTS demo_certificates (
        user_id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
    ''')


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    name: str = Field(default='', max_length=120)


class Login(BaseModel):
    email: EmailStr
    password: str


class EmailOnly(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    token: str
    password: str = Field(min_length=10, max_length=200)


class Progress(BaseModel):
    payload: dict


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class ExamAnswer(BaseModel):
    id: str
    answer: str = Field(max_length=1000)


class ExamSubmission(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    answers: list[ExamAnswer] = Field(min_length=40, max_length=40)


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1800)


def throttle(request, key, max_count=8, period=900):
    # Only trust the direct peer, not user-controlled X-Forwarded-For.
    peer = request.client.host if request.client else 'unknown'
    k = (peer, key)
    ts = now()
    values = [x for x in limits.get(k, []) if x > ts - period]
    if len(values) >= max_count:
        raise HTTPException(429, 'Забагато спроб. Спробуйте пізніше.')
    values.append(ts)
    limits[k] = values


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    result = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return salt.hex(), result.hex()


def check_password(password, row):
    if not row['password_salt'] or not row['password_hash']:
        return False
    _, digest = hash_password(password, bytes.fromhex(row['password_salt']))
    return hmac.compare_digest(digest, row['password_hash'])


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_token(con, user_id, kind, lifetime):
    token = secrets.token_urlsafe(40)
    con.execute('INSERT INTO tokens VALUES (?,?,?,?)', (token_hash(token), user_id, kind, now() + lifetime))
    return token


def send_mail(to, title, body):
    host = os.getenv('SMTP_HOST')
    sender = os.getenv('SMTP_FROM')
    if not host or not sender:
        raise HTTPException(503, 'Пошта ще не налаштована адміністратором.')
    msg = EmailMessage()
    msg['From'], msg['To'], msg['Subject'] = sender, to, title
    msg.set_content(body)
    with smtplib.SMTP(host, int(os.getenv('SMTP_PORT', '587')), timeout=15) as smtp:
        if os.getenv('SMTP_STARTTLS', 'true').lower() == 'true':
            smtp.starttls()
        if os.getenv('SMTP_USERNAME'):
            smtp.login(os.getenv('SMTP_USERNAME'), os.getenv('SMTP_PASSWORD', ''))
        smtp.send_message(msg)


def logged_in(request):
    token = request.cookies.get('tests_session')
    if not token:
        raise HTTPException(401, 'Увійдіть до особистого кабінету.')
    with db() as con:
        user = con.execute('''SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
             WHERE s.token_hash=? AND s.expires>?''', (token_hash(token), now())).fetchone()
    if not user:
        raise HTTPException(401, 'Сесія завершилася. Увійдіть знову.')
    return user


def issue_session(user_id):
    token = secrets.token_urlsafe(48)
    with db() as con:
        con.execute('INSERT INTO sessions VALUES (?,?,?)', (token_hash(token), user_id, now() + SESSION_DAYS * 86400))
    response = JSONResponse({'ok': True})
    response.set_cookie('tests_session', token, httponly=True, secure=COOKIE_SECURE,
                        samesite='lax', max_age=SESSION_DAYS*86400, path='/')
    return response


def check_origin(request):
    origin = request.headers.get('origin')
    if origin and origin != SITE_URL:
        raise HTTPException(403, 'Недозволене походження запиту.')


@app.post('/api/register')
def register(data: Credentials, request: Request):
    check_origin(request)
    throttle(request, 'register', 5)
    with db() as con:
        if con.execute('SELECT 1 FROM users WHERE email=?', (data.email.lower(),)).fetchone():
            raise HTTPException(409, 'Цю адресу вже зареєстровано.')
        salt, digest = hash_password(data.password)
        cursor = con.execute('INSERT INTO users (email,password_salt,password_hash,display_name,created_at) VALUES (?,?,?,?,?)',
                             (data.email.lower(), salt, digest, data.name, now()))
        token = create_token(con, cursor.lastrowid, 'verify', 24*3600)
        try:
            send_mail(data.email, 'Підтвердження реєстрації — Тести на державну службу',
                      f'Вітаємо! Підтвердіть адресу протягом 24 годин:\n{SITE_URL}/api/verify?token={token}\n\nЯкщо це були не ви, проігноруйте лист.')
        except Exception:
            raise HTTPException(503, 'Не вдалося надіслати лист. Перевірте налаштування пошти.')
    return {'message': 'Перевірте електронну пошту та підтвердіть реєстрацію.'}


@app.get('/api/verify')
def verify(token: str):
    with db() as con:
        row = con.execute("SELECT * FROM tokens WHERE token_hash=? AND kind='verify' AND expires>?", (token_hash(token), now())).fetchone()
        if not row:
            return RedirectResponse('/?auth=expired', status_code=303)
        con.execute('UPDATE users SET verified=1 WHERE id=?', (row['user_id'],))
        con.execute('DELETE FROM tokens WHERE token_hash=?', (token_hash(token),))
    return RedirectResponse('/?auth=verified', status_code=303)


@app.post('/api/login')
def login(data: Login, request: Request):
    check_origin(request)
    throttle(request, 'login', 12)
    with db() as con:
        user = con.execute('SELECT * FROM users WHERE email=?', (data.email.lower(),)).fetchone()
    if not user or not check_password(data.password, user):
        raise HTTPException(401, 'Неправильна пошта або пароль.')
    if not user['verified']:
        raise HTTPException(403, 'Підтвердіть адресу з електронного листа.')
    return issue_session(user['id'])


@app.post('/api/logout')
def logout(request: Request):
    check_origin(request)
    token = request.cookies.get('tests_session')
    if token:
        with db() as con:
            con.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash(token),))
    response = JSONResponse({'ok': True})
    response.delete_cookie('tests_session')
    return response


@app.post('/api/forgot')
def forgot(data: EmailOnly, request: Request):
    check_origin(request)
    throttle(request, 'forgot', 5)
    with db() as con:
        row = con.execute('SELECT * FROM users WHERE email=?', (data.email.lower(),)).fetchone()
        if row and row['password_hash']:
            token = create_token(con, row['id'], 'reset', 3600)
            try:
                send_mail(data.email, 'Скидання пароля — Тести на державну службу',
                          f'Відкрийте посилання протягом однієї години:\n{SITE_URL}/?reset={token}\n\nЯкщо це були не ви, проігноруйте лист.')
            except Exception:
                raise HTTPException(503, 'Поштовий сервер зараз недоступний.')
    return {'message': 'Якщо адресу зареєстровано, на неї надіслано інструкцію.'}


@app.post('/api/reset')
def reset(data: ResetPassword, request: Request):
    check_origin(request)
    throttle(request, 'reset', 8)
    with db() as con:
        row = con.execute("SELECT * FROM tokens WHERE token_hash=? AND kind='reset' AND expires>?", (token_hash(data.token), now())).fetchone()
        if not row:
            raise HTTPException(400, 'Посилання недійсне або його термін сплив.')
        salt, digest = hash_password(data.password)
        con.execute('UPDATE users SET password_salt=?,password_hash=? WHERE id=?', (salt, digest, row['user_id']))
        con.execute('DELETE FROM tokens WHERE user_id=?', (row['user_id'],))
        con.execute('DELETE FROM sessions WHERE user_id=?', (row['user_id'],))
    return {'message': 'Пароль змінено. Тепер увійдіть.'}


@app.get('/api/me')
def me(request: Request):
    user = logged_in(request)
    with db() as con:
        row = con.execute('SELECT payload FROM progress WHERE user_id=?', (user['id'],)).fetchone()
        certificates = [dict(x) for x in con.execute('SELECT * FROM certificates WHERE user_id=? ORDER BY created_at DESC', (user['id'],)).fetchall()]
        # A demo document is not an exam result. Give the designated account its
        # own unguessable, stable code; migrate the former public demo number.
        if DEMO_CERTIFICATE_EMAIL and hmac.compare_digest(user['email'].lower(), DEMO_CERTIFICATE_EMAIL):
            con.execute('DELETE FROM demo_certificates WHERE code=? AND user_id<>?',
                        ('DEMO-TESTS-0001', user['id']))
            existing=con.execute('SELECT code FROM demo_certificates WHERE user_id=?',
                                 (user['id'],)).fetchone()
            if not existing:
                con.execute('INSERT INTO demo_certificates (user_id,code,created_at) VALUES (?,?,?)',
                            (user['id'], 'DEMO-'+secrets.token_hex(12).upper(), now()))
            elif existing['code']=='DEMO-TESTS-0001':
                con.execute('UPDATE demo_certificates SET code=? WHERE user_id=?',
                            ('DEMO-'+secrets.token_hex(12).upper(), user['id']))
        else:
            con.execute('DELETE FROM demo_certificates WHERE user_id=? AND code=?',
                        (user['id'], 'DEMO-TESTS-0001'))
        samples = [dict(x) for x in con.execute(
            'SELECT code,created_at FROM demo_certificates WHERE user_id=?', (user['id'],)
        ).fetchall()]
    return {'email': user['email'], 'name': user['display_name'], 'progress': json.loads(row['payload']) if row else None,
            'certificates': certificates, 'demo_certificates': samples}


@app.put('/api/profile')
def update_profile(data: ProfileUpdate, request: Request):
    check_origin(request)
    user = logged_in(request)
    name = ' '.join(data.name.strip().split())
    if len(name) < 2:
        raise HTTPException(422, 'Вкажіть ім’я та прізвище.')
    with db() as con:
        con.execute('UPDATE users SET display_name=? WHERE id=?', (name, user['id']))
    return {'ok': True, 'name': name}


@app.put('/api/progress')
async def put_progress(data: Progress, request: Request):
    check_origin(request)
    user = logged_in(request)
    raw = json.dumps(data.payload, ensure_ascii=False)
    if len(raw.encode()) > MAX_BODY:
        raise HTTPException(413, 'Занадто великий обсяг прогресу.')
    with db() as con:
        con.execute('INSERT INTO progress VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',
                    (user['id'], raw, now()))
    return {'ok': True}


OVERRIDE_CORRECT = {
    'legislation-1': 'Бюджетні установи в особі їх керівників, уповноважені на бюджетні асигнування, зобов’язання та видатки.',
    'legislation-2': 'Фінансову та бюджетну звітність.',
    'legislation-3': 'Верховна Рада України.',
    'legislation-4': 'Єдності, збалансованості, самостійності.',
    'legislation-5': 'На інших посадових осіб апарату, крім Секретаря, його заступника, державних аудиторів і радників членів Палати.',
    'legislation-6': 'Законність, незалежність, об’єктивність, безсторонність, гласність та неупередженість.'
}


def short(s, max_len=205):
    s = s.lstrip('-• \t\n').strip()
    if len(s) <= max_len:
        return s
    return s[:max_len].rsplit(' ', 1)[0] + '…'


@app.post('/api/exams')
def submit_exam(data: ExamSubmission, request: Request):
    check_origin(request)
    user = logged_in(request)
    ids = [x.id for x in data.answers]
    if len(set(ids)) != 40 or any(i not in questions or questions[i].get('missing') for i in ids):
        raise HTTPException(400, 'Потрібно 40 різних запитань із бази.')
    score = sum(x.answer.strip() == OVERRIDE_CORRECT.get(x.id, short(questions[x.id]['answer'])) for x in data.answers)
    percent = (score * 100 + 20) // 40
    with db() as con:
        blocked = con.execute('SELECT MAX(next_allowed_at) AS next_at FROM certificates WHERE user_id=? AND passed=0', (user['id'],)).fetchone()
        if blocked['next_at'] and blocked['next_at'] > now():
            raise HTTPException(403, 'Повторна спроба доступна через 15 днів.')
        ident = secrets.token_hex(16)
        passed = int(percent >= 70)
        next_at = None if passed else now()+15*86400
        con.execute('INSERT INTO certificates VALUES (?,?,?,?,?,?,?,?)', (ident, user['id'], data.name, percent, score, passed, now(), next_at))
    return {'id': ident, 'score': percent, 'correct': score, 'passed': bool(passed), 'next_allowed_at': next_at}


@app.get('/api/voice/status')
def voice_status():
    model = Path(os.getenv('PIPER_MODEL', '/models/uk_UA-tetiana-high.onnx'))
    return {'ready': model.is_file() and model.with_suffix('.onnx.json').is_file(), 'name': 'Тетяна · українська жіноча · Piper'}


@app.post('/api/voice')
async def voice(data: SpeechRequest, request: Request):
    check_origin(request)
    throttle(request, 'voice', 30, 60)
    model = Path(os.getenv('PIPER_MODEL', '/models/uk_UA-tetiana-high.onnx'))
    if not model.is_file() or not model.with_suffix('.onnx.json').is_file():
        raise HTTPException(503, 'Голосову модель ще не встановлено на сервері.')
    async with speech_lock:
        def synthesize():
            with tempfile.TemporaryDirectory() as d:
                output = Path(d) / 'output.wav'
                p = subprocess.run(['piper', '--model', str(model), '--output_file', str(output)],
                                   input=data.text, text=True, capture_output=True, timeout=90)
                if p.returncode or not output.is_file():
                    raise RuntimeError(p.stderr[-300:])
                return output.read_bytes()
        try:
            audio = await asyncio.to_thread(synthesize)
        except Exception:
            raise HTTPException(503, 'Не вдалося синтезувати аудіо.')
    return Response(audio, media_type='audio/wav', headers={'Cache-Control': 'no-store'})


@app.get('/api/google/start')
def google_start():
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    if not client_id:
        raise HTTPException(503, 'Вхід Google ще не налаштований.')
    state = secrets.token_urlsafe(32)
    params = dict(client_id=client_id, response_type='code', redirect_uri=SITE_URL+'/api/google/callback', scope='openid email profile', state=state, prompt='select_account')
    response = RedirectResponse('https://accounts.google.com/o/oauth2/v2/auth?'+urlencode(params))
    response.set_cookie('google_oauth_state', state, max_age=600, httponly=True, secure=COOKIE_SECURE, samesite='lax')
    return response


@app.get('/api/google/callback')
async def google_callback(request: Request, code: str, state: str):
    expected = request.cookies.get('google_oauth_state', '')
    if not expected or not hmac.compare_digest(expected, state):
        raise HTTPException(403, 'Помилка перевірки Google OAuth.')
    async with httpx.AsyncClient(timeout=15) as client:
        token_result = await client.post('https://oauth2.googleapis.com/token', data={
            'code': code, 'client_id': os.environ['GOOGLE_CLIENT_ID'],
            'client_secret': os.environ['GOOGLE_CLIENT_SECRET'],
            'redirect_uri': SITE_URL+'/api/google/callback', 'grant_type': 'authorization_code'})
        if token_result.status_code != 200:
            raise HTTPException(401, 'Не вдалося підтвердити вхід Google.')
        id_token = token_result.json().get('id_token', '')
        info = await client.get('https://oauth2.googleapis.com/tokeninfo', params={'id_token': id_token})
        if info.status_code != 200:
            raise HTTPException(401, 'Недійсний токен Google.')
        identity = info.json()
    if identity.get('aud') != os.environ['GOOGLE_CLIENT_ID'] or identity.get('email_verified') not in (True, 'true') or int(identity.get('exp', '0')) < now():
        raise HTTPException(401, 'Обліковий запис Google не підтверджено.')
    email, sub = identity['email'].lower(), identity['sub']
    with db() as con:
        user = con.execute('SELECT * FROM users WHERE google_sub=? OR email=?', (sub, email)).fetchone()
        if user and user['google_sub'] and user['google_sub'] != sub:
            raise HTTPException(409, 'Ця адреса вже прив’язана до іншого Google-акаунта.')
        if user:
            con.execute('UPDATE users SET google_sub=?,verified=1 WHERE id=?', (sub, user['id']))
            uid = user['id']
        else:
            uid = con.execute('INSERT INTO users (email,google_sub,display_name,verified,created_at) VALUES (?,?,?,?,?)',
                (email, sub, identity.get('name',''), 1, now())).lastrowid
    signed = issue_session(uid)
    signed.status_code = 303
    signed.headers['location'] = '/?auth=google'
    signed.delete_cookie('google_oauth_state')
    return signed


# Public, read-only verification deliberately exposes no email, session, or progress data.
# Real certificate ids are 128-bit random tokens; demo code is explicitly non-qualifying.
def certificate_record(identifier: str):
    if not re.fullmatch(r'[0-9a-f]{32}|DEMO-[A-F0-9]{24}', identifier):
        raise HTTPException(404, 'Документ не знайдено.')
    with db() as con:
        if identifier.startswith('DEMO-'):
            row=con.execute('''SELECT d.code AS id,d.created_at,u.display_name AS name
                FROM demo_certificates d JOIN users u ON u.id=d.user_id
                WHERE d.code=?''',(identifier,)).fetchone()
            if not row:raise HTTPException(404, 'Документ не знайдено.')
            return {'id':row['id'],'type':'demo','status':'sample','name':row['name'],
                    'created_at':row['created_at'],'passed':False,
                    'official':False,'message':'Демонстраційний зразок. Не підтверджує складання іспиту або кваліфікацію.'}
        row=con.execute('''SELECT id,name,score,correct,passed,created_at
            FROM certificates WHERE id=?''',(identifier,)).fetchone()
    if not row:raise HTTPException(404,'Документ не знайдено.')
    return {'id':row['id'],'type':'training_exam','status':'passed' if row['passed'] else 'not_passed',
            'name':row['name'],'score':row['score'],'correct':row['correct'],
            'total':40,'created_at':row['created_at'],'passed':bool(row['passed']),
            'official':False,'message':'Результат навчального тестування TESTS. Не є офіційним документом НАДС.'}


@app.get('/api/certificates/verify/{identifier}')
def verify_certificate_api(identifier: str):
    return certificate_record(identifier)


@app.get('/api/certificates/qr/{identifier}')
def certificate_qr(identifier: str):
    certificate_record(identifier)  # Never display a valid-looking QR for an unregistered document.
    destination=f'{SITE_URL}/verify/{identifier}'
    qr=qrcode.QRCode(version=None,error_correction=qrcode.constants.ERROR_CORRECT_M,
                     box_size=8,border=4)
    qr.add_data(destination)
    qr.make(fit=True)
    image=qr.make_image(fill_color='black',back_color='white')
    stream=io.BytesIO()
    image.save(stream,format='PNG')
    return Response(stream.getvalue(),media_type='image/png',
                    headers={'Cache-Control':'private, max-age=300',
                             'X-Content-Type-Options':'nosniff'})


@app.get('/verify/{identifier}',response_class=Response)
def verify_certificate_page(identifier: str):
    from html import escape
    from datetime import datetime, timezone
    try:
        record=certificate_record(identifier)
    except HTTPException:
        return Response('<!doctype html><html lang="uk"><meta charset="utf-8">'
                        '<title>Документ не знайдено — TESTS</title><h1>Документ не знайдено</h1>'
                        '<p>Номер відсутній у реєстрі TESTS.</p></html>',
                        status_code=404,media_type='text/html; charset=utf-8')
    sample=record['type']=='demo'
    status='ДЕМОНСТРАЦІЙНИЙ ЗРАЗОК' if sample else ('ТЕСТУВАННЯ ПРОЙДЕНО' if record['passed'] else 'ТЕСТУВАННЯ НЕ ПРОЙДЕНО')
    date=datetime.fromtimestamp(record['created_at'],tz=timezone.utc).strftime('%d.%m.%Y %H:%M UTC')
    details='' if sample else f"<dt>Результат</dt><dd>{record['score']} зі 100; правильних відповідей: {record['correct']} із 40</dd>"
    html=('<!doctype html><html lang="uk"><head><meta charset="utf-8">'
          '<meta name="viewport" content="width=device-width,initial-scale=1">'
          '<title>Перевірка документа — TESTS</title>'
          '<style>body{font:16px/1.6 system-ui,sans-serif;background:#eff8f6;color:#163940;margin:0;padding:24px}'
          'main{max-width:680px;margin:5vh auto;background:white;border:1px solid #cde3dc;border-radius:20px;padding:32px}'
          'h1{color:#0b615f}dt{font-weight:700;margin-top:12px}dd{margin:2px 0 10px;overflow-wrap:anywhere}'
          '.status{display:inline-block;background:#e4f5f1;padding:8px 14px;border-radius:20px;font-weight:800}'
          '.notice{margin-top:24px;border-top:1px solid #dce9e6;padding-top:15px;color:#5d747b}'
          'a{color:#087c73}</style></head><body><main><a href="/">TESTS · Навчальна платформа</a>'
          '<h1>Перевірка документа</h1><p class="status">'+escape(status)+'</p><dl>'
          '<dt>Номер у реєстрі</dt><dd>'+escape(record['id'])+'</dd>'
          '<dt>Власник / учасник</dt><dd>'+escape(record['name'])+'</dd>'
          '<dt>Дата реєстрації</dt><dd>'+escape(date)+'</dd>'+details+'</dl>'
          '<p class="notice">'+escape(record['message'])+'</p></main></body></html>')
    return Response(html,media_type='text/html; charset=utf-8',
                    headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'})


@app.get('/api/health')
def health():
    return {'ok': True, 'demo_certificate_policy': 'email-v2'}


app.mount('/assets', StaticFiles(directory=str(BASE / 'dist')), name='assets')


@app.get('/{full_path:path}')
def static(full_path: str):
    if full_path.startswith('api/'):
        raise HTTPException(404)
    folder = (BASE / 'dist').resolve()
    target = (folder / full_path).resolve()
    if target.is_file() and target.is_relative_to(folder):
        return FileResponse(target)
    return FileResponse(folder / 'index.html')
