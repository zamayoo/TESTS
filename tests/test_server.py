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
            self.assertTrue(sample[0]['code'].startswith('DEMO-'))
            self.assertEqual(len(sample[0]['code']), 29)
            self.assertRegex(sample[0]['code'][5:], r'^[A-F0-9]{24}')
            again = backend.me(request)['demo_certificates']
            self.assertEqual(sample[0]['code'], again[0]['code'])
            with backend.db() as con:
                owner = con.execute('SELECT user_id FROM demo_certificates WHERE code=?',
                                    (sample[0]['code'],)).fetchone()
            self.assertEqual(owner['user_id'], 2)
            verified=self.client.get('/api/certificates/verify/'+sample[0]['code'])
            self.assertEqual(verified.status_code, 200)
            self.assertEqual(verified.json()['name'], 'Oleg Zamay')
        finally:
            with backend.db() as con:
                con.execute('DELETE FROM demo_certificates')
                con.execute('DELETE FROM sessions')
                con.execute('DELETE FROM users')

    def test_demo_certificate_keeps_disclaimer_and_security_layers(self):
        source = (Path(__file__).parents[1] / 'dist' / 'account.js').read_text(encoding='utf-8')
        self.assertGreaterEqual(source.count('data-security-layer='), 10)
        self.assertIn('НЕОФІЦІЙНИЙ ДЕМОНСТРАЦІЙНИЙ ДОКУМЕНТ', source)
        self.assertIn('СКАНУЙТЕ ДЛЯ', source)
        self.assertIn('/api/certificates/qr/', source)
        self.assertIn('certificatePrintRoot', source)
        self.assertIn('не має юридичної сили', source)

    def test_certificate_verification_and_real_qr_png(self):
        backend=self.backend
        # A demo certificate is an educational sample, never proof of qualification.
        with backend.db() as con:
            con.execute("INSERT INTO users (email,display_name,verified,created_at) VALUES (?,?,?,?)",
                        ('qr-test@example.org','QR Test',1,backend.now()))
            user_id=con.execute("SELECT id FROM users WHERE email='qr-test@example.org'").fetchone()['id']
            con.execute('INSERT INTO demo_certificates VALUES (?,?,?)',
                        (user_id,'DEMO-ABCD1234ABCD1234ABCD1234',backend.now()))
            real_id='1234567890abcdef1234567890abcdef'
            con.execute('''INSERT INTO certificates
                (id,user_id,name,course_id,score,correct,passed,created_at,next_allowed_at)
                VALUES (?,?,?,?,?,?,?,?,?)''',
                        (real_id,user_id,'Тестовий Учень','audit',80,32,1,backend.now(),None))
        try:
            demo=self.client.get('/api/certificates/verify/DEMO-ABCD1234ABCD1234ABCD1234')
            self.assertEqual(demo.status_code,200)
            self.assertEqual(demo.json()['type'],'demo')
            self.assertFalse(demo.json()['passed'])
            self.assertFalse(demo.json()['official'])
            real=self.client.get('/api/certificates/verify/'+real_id)
            self.assertEqual(real.status_code,200)
            self.assertEqual(real.json()['score'],80)
            self.assertEqual(real.json()['correct'],32)
            self.assertTrue(real.json()['passed'])
            self.assertNotIn('email',real.json())
            qr=self.client.get('/api/certificates/qr/'+real_id)
            self.assertEqual(qr.status_code,200)
            self.assertIn('image/png',qr.headers['content-type'])
            self.assertTrue(qr.content.startswith(bytes([137,80,78,71,13,10,26,10])))
            self.assertGreater(len(qr.content),100)
            page=self.client.get('/verify/'+real_id)
            self.assertEqual(page.status_code,200)
            self.assertIn('Тестовий Учень',page.text)
            self.assertIn('80 зі 100',page.text)
            self.assertIn('не є офіційним',page.text.lower())
            self.assertEqual(self.client.get('/verify/'+('0'*32)).status_code,404)
            self.assertEqual(self.client.get('/api/certificates/qr/'+('0'*32)).status_code,404)
        finally:
            with backend.db() as con:
                con.execute('DELETE FROM demo_certificates WHERE user_id=?',(user_id,))
                con.execute('DELETE FROM certificates WHERE user_id=?',(user_id,))
                con.execute('DELETE FROM users WHERE id=?',(user_id,))

    def test_certificate_print_has_only_one_isolated_a4_sheet(self):
        root=Path(__file__).parents[1]
        css=(root/'dist'/'styles.css').read_text(encoding='utf-8')
        account=(root/'dist'/'account.js').read_text(encoding='utf-8')
        app=(root/'dist'/'app.js').read_text(encoding='utf-8')
        self.assertIn('@page{size:A4 landscape;margin:0}',css)
        self.assertIn('width:210mm!important;height:148.5mm!important',css)
        self.assertIn('body.print-demo-certificate > :not(#certificatePrintRoot)',css)
        self.assertIn('body.print-exam-certificate > :not(#examCertificatePrintRoot)',css)
        self.assertIn("copy.removeAttribute('id')",account)
        self.assertIn("copy.removeAttribute('id')",app)
        self.assertIn('window.addEventListener(\'afterprint\'',account)
        self.assertIn('window.addEventListener(\'afterprint\'',app)

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
            profile = self.client.put('/api/profile', json={'name':'Олег Замай'})
            self.assertEqual(profile.status_code, 200, profile.text)
            self.assertEqual(profile.json()['name'], 'Олег Замай')
            self.assertEqual(self.client.get('/api/me').json()['name'], 'Олег Замай')
            self.assertEqual(self.client.put('/api/profile', json={'name':'  '}).status_code, 422)
            self.assertEqual(self.client.put('/api/profile', json={'name':'Інше'}, headers={'Origin':'https://evil.example'}).status_code, 403)
            sample = self.client.get('/api/me').json()['demo_certificates']
            self.assertEqual(sample, [])
            self.assertEqual(self.client.get('/api/me').json()['certificates'], [])
            progress = {'answers': {'legislation-1':{'correct': True}}}
            self.assertEqual(self.client.put('/api/progress',json={'payload':progress}).status_code,200)
            self.assertEqual(self.client.get('/api/me').json()['progress'],progress)
            self.assertEqual(self.client.post('/api/forgot',json={'email':'oleg@example.org'}).status_code,200)
            reset_token = send.call_args.args[2].split('reset=')[-1].split('\n')[0]
            self.assertEqual(self.client.post('/api/reset',json={'token':reset_token,'password':'EvenLongerPassword99!'}).status_code,200)
            self.assertEqual(self.client.get('/api/me').status_code,401)
            self.assertEqual(self.client.post('/api/login',json={'email':'oleg@example.org','password':'EvenLongerPassword99!'}).status_code,200)

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
        certificates=self.client.get('/api/me').json()['certificates']
        self.assertEqual(len([item for item in certificates if item['course_id']=='audit']),1)

    def test_z_each_new_course_is_scored_with_its_own_rules(self):
        backend = self.backend
        for course_id in ('analytical', 'procurement', 'iq'):
            course = backend.courses[course_id]
            selected = list(backend.questions_by_course[course_id].values())[:course['examSize']]
            answers = [{'id': q['id'], 'answer': q['choices'][q['correct']]} for q in selected]
            response = self.client.post('/api/exams', json={
                'course_id': course_id,
                'name': 'Замай Олег Олегович',
                'answers': answers,
            })
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['score'], 100)
            self.assertTrue(response.json()['passed'])
            verified = self.client.get('/api/certificates/verify/' + response.json()['id']).json()
            self.assertEqual(verified['course_id'], course_id)
            self.assertEqual(verified['total'], course['examSize'])

    def test_course_datasets_are_complete_and_answers_are_valid(self):
        backend = self.backend
        self.assertEqual(len(backend.questions_by_course['analytical']), 30)
        self.assertEqual(len(backend.questions_by_course['procurement']), 210)
        self.assertEqual(len(backend.questions_by_course['iq']), 38)
        self.assertEqual(backend.courses['iq']['timeLimitMinutes'], 20)
        self.assertIn('не є стандартизованим показником IQ', backend.courses['iq']['disclaimer'])
        for course_id in ('analytical', 'procurement', 'iq'):
            for question in backend.questions_by_course[course_id].values():
                self.assertGreaterEqual(question['correct'], 0)
                self.assertLess(question['correct'], len(question['choices']))
                self.assertEqual(question['answer'], question['choices'][question['correct']])


class InterfaceStructureTests(unittest.TestCase):
    def test_settings_workspace_and_preferences_are_isolated(self):
        root = Path(__file__).parents[1]
        html = (root / 'dist' / 'index.html').read_text(encoding='utf-8')
        js = (root / 'dist' / 'app.js').read_text(encoding='utf-8')
        css = (root / 'dist' / 'styles.css').read_text(encoding='utf-8')
        for control in ('prefTheme','prefDensity','prefContrast','prefFont',
                        'prefMotion','prefProgress','prefRememberTopic','prefAutoNext','prefReset'):
            self.assertEqual(html.count('id="'+control+'"'), 1)
        self.assertIn('data-view="settings"', html)
        self.assertIn("PREFS_KEY='tests-ui-preferences-v1'", js)
        self.assertIn("localStorage.setItem(PREFS_KEY", js)
        self.assertIn("function applyPrefs()", js)
        self.assertIn("function setupPreferences()", js)
        self.assertIn("prefs.theme==='system'?(systemDark?'dark':'light')", js)
        self.assertIn("if(prefs.autoNext", js)
        self.assertIn('html[data-theme="dark"]', css)
        self.assertIn('html[data-theme="dark"] .question-card h3{color:#102f38!important', css)
        self.assertIn('html[data-theme="dark"] .block strong{color:#e6f0f1!important', css)
        self.assertIn('html[data-density="compact"]', css)
        self.assertIn('html[data-motion="reduced"]', css)
        self.assertIn('html[data-show-progress="no"]', css)
        self.assertIn('Відновити стандартні налаштування', html)
        self.assertEqual(html.count('id="learningTopicCards"'), 1)
        self.assertIn("renderTopicCardSet($('learningTopicCards'),groups)", js)

    def test_spa_views_and_navigation_are_separate(self):
        root = Path(__file__).parents[1]
        html = (root / 'dist' / 'index.html').read_text(encoding='utf-8')
        script = (root / 'dist' / 'app.js').read_text(encoding='utf-8')
        for view in ('catalogView', 'learningView', 'certificationView', 'accountView'):
            self.assertEqual(html.count(f'id="{view}"'), 1)
        for route in ('catalog', 'learning', 'certification', 'account'):
            self.assertIn(f'data-route="{route}"', html)
            self.assertIn(route, script)
        self.assertIn("window.testsNavigate", script)
        self.assertIn("location.hash", script)


if __name__ == '__main__':
    unittest.main()
