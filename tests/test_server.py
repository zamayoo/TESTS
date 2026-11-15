import importlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.requests import Request


class AccountTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        os.environ['DATA_PATH'] = str(Path(cls.tmp.name) / 'test.db')
        os.environ['COOKIE_SECURE'] = 'false'
        cls.backend = importlib.import_module('server.main')
        cls.client = TestClient(cls.backend.app, base_url='http://testserver')

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        cls.tmp.cleanup()

    def test_a_demo_certificate_follows_target_email_not_database_id(self):
        backend = self.backend
        session_token = 'target-demo-session'
        with backend.db() as con:
            con.execute("INSERT INTO users (id,email,display_name,verified,created_at) VALUES (1,'first@example.org','Перший',1,?)", (backend.now(),))
            con.execute("INSERT INTO users (id,email,display_name,verified,created_at) VALUES (2,'zamayoo@gmail.com','Oleg Zamay',1,?)", (backend.now(),))
            con.execute('INSERT INTO sessions VALUES (?,?,?)',
                        (backend.token_hash(session_token), 2, backend.now() + 3600))
            con.execute('INSERT INTO demo_certificates VALUES (?,?,?)',
                        (1, 'DEMO-TESTS-0001', backend.now()))
        try:
            request = Request({'type': 'http', 'method': 'GET', 'path': '/api/me',
                               'headers': [(b'cookie', f'tests_session={session_token}'.encode())]})
            sample = backend.me(request)['demo_certificates']
            self.assertEqual(len(sample), 1)
            self.assertEqual(sample[0]['code'], 'DEMO-TESTS-0001')
            with backend.db() as con:
                owner = con.execute('SELECT user_id FROM demo_certificates WHERE code=?',
                                    ('DEMO-TESTS-0001',)).fetchone()
            self.assertEqual(owner['user_id'], 2)
        finally:
            with backend.db() as con:
                con.execute('DELETE FROM demo_certificates')
                con.execute('DELETE FROM sessions')
                con.execute('DELETE FROM users')

    def test_demo_certificate_keeps_disclaimer_and_security_layers(self):
        source = (Path(__file__).parents[1] / 'dist' / 'account.js').read_text(encoding='utf-8')
        self.assertGreaterEqual(source.count('data-security-layer='), 10)
        self.assertIn('НЕОФІЦІЙНИЙ ДЕМОНСТРАЦІЙНИЙ ДОКУМЕНТ', source)
        self.assertIn('НЕ Є QR-КОДОМ', source)
        self.assertIn('не має юридичної сили', source)

    def test_registration_verification_login_reset_and_progress(self):
        backend = self.backend
        with patch.object(backend, 'send_mail') as send:
            response = self.client.post('/api/register', json={'email':'oleg@example.org','password':'LongPassword9!','name':'Олег'})
            self.assertEqual(response.status_code, 200, response.text)
            token = send.call_args.args[2].split('token=')[-1].split('\n')[0]
            unverified = self.client.post('/api/login',json={'email':'oleg@example.org','password':'LongPassword9!'})
            self.assertEqual(unverified.status_code, 403)
            self.assertEqual(self.client.get('/api/verify',params={'token':token},follow_redirects=False).status_code,303)
            login = self.client.post('/api/login',json={'email':'oleg@example.org','password':'LongPassword9!'})
            self.assertEqual(login.status_code, 200, login.text)
            self.assertEqual(self.client.get('/api/me').json()['email'], 'oleg@example.org')
            sample = self.client.get('/api/me').json()['demo_certificates']
            self.assertEqual(sample, [])
            self.assertEqual(self.client.get('/api/me').json()['certificates'], [])
            self.assertEqual(self.client.put('/api/profile', json={'name':'Олег Замай'}).status_code, 200)
            self.assertEqual(self.client.get('/api/me').json()['name'], 'Олег Замай')
            self.assertEqual(self.client.put('/api/profile', json={'name':'  '}).status_code, 422)
            self.assertEqual(self.client.put('/api/profile', json={'name':'Інше'},headers={'Origin':'https://evil.example'}).status_code, 403)

            progress = {'answers': {'legislation-1':{'correct': True}}}
            self.assertEqual(self.client.put('/api/progress',json={'payload':progress}).status_code,200)
            self.assertEqual(self.client.get('/api/me').json()['progress'],progress)
            self.assertEqual(self.client.post('/api/forgot',json={'email':'oleg@example.org'}).status_code,200)
            reset_token = send.call_args.args[2].split('reset=')[-1].split('\n')[0]
            self.assertEqual(self.client.post('/api/reset',json={'token':reset_token,'password':'EvenLongerPassword99!'}).status_code,200)
            self.assertEqual(self.client.get('/api/me').status_code,401)
            self.assertEqual(self.client.post('/api/login',json={'email':'oleg@example.org','password':'EvenLongerPassword99!'}).status_code,200)

    def test_spa_splits_learning_exam_and_profile(self):
        html = (Path(__file__).parents[1] / 'dist' / 'index.html').read_text(encoding='utf-8')
        js = (Path(__file__).parents[1] / 'dist' / 'app.js').read_text(encoding='utf-8')
        for view in ('home', 'catalog', 'learning', 'certification', 'account'):
            self.assertIn(f'id="view-{view}"', html)
        self.assertLess(html.index('id="view-learning"'), html.index('id="view-certification"'))
        self.assertLess(html.index('id="view-certification"'), html.index('id="view-account"'))
        self.assertIn('window.testsNavigate=navigate', js)
        self.assertIn("navigate('learning')", js)
        self.assertIn('id="profileEditForm"', html)
        self.assertIn('id="demoCertificateCanvas"', html)

    def test_z_exam_is_scored_on_server(self):
        backend = self.backend
        response = self.client.post('/api/login',json={'email':'oleg@example.org','password':'EvenLongerPassword99!'})
        self.assertEqual(response.status_code, 200)
        selected = [q for q in backend.questions.values() if not q.get('missing')][:40]
        answers = [{'id':q['id'],'answer':backend.OVERRIDE_CORRECT.get(q['id'],backend.short(q['answer']))} for q in selected]
        response = self.client.post('/api/exams', json={'name':'Замай Олег Олегович','answers':answers})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['score'],100)
        self.assertTrue(response.json()['passed'])
        self.assertEqual(len(self.client.get('/api/me').json()['certificates']),1)


if __name__ == '__main__':
    unittest.main()
