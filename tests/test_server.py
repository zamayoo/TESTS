import importlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


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
            self.assertEqual(len(sample), 1)
            self.assertEqual(sample[0]['code'], 'DEMO-TESTS-0001')
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
        self.assertEqual(len(self.client.get('/api/me').json()['certificates']),1)


if __name__ == '__main__':
    unittest.main()
