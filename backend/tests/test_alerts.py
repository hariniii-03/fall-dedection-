"""Characterization tests for the first increment's rules and alert lifecycle."""
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from pwdlib import PasswordHash

from backend.app import Helmet, User, Worker, app, database


def setup(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_URL', f'sqlite:///{tmp_path}/alert.db')
    monkeypatch.setenv('JWT_SECRET', 'testing-secret-only-not-for-real-users-1234567')
    with database() as db:
        hasher = PasswordHash.recommended()
        db.add_all([
            User(id='supervisor', name='Supervisor', role='supervisor', password_hash=hasher.hash('private-test-password')),
            User(id='WORKER-001', name='Worker', role='worker', password_hash=hasher.hash('private-test-password')),
            Worker(id='WORKER-001', name='Worker', zone='A', helmet_id='HELMET-001'),
            Helmet(id='HELMET-001', worker_id='WORKER-001', key_hash=hasher.hash('device-test-key'), sensors={'gas': True}),
        ])
        db.commit()


def login(client, username):
    r = client.post('/api/auth/login', json={'username': username, 'password': 'private-test-password'})
    assert r.status_code == 200
    return {'Authorization': 'Bearer ' + r.json()['token']}


def test_gas_alert_and_lifecycle(tmp_path, monkeypatch):
    setup(tmp_path, monkeypatch)
    with TestClient(app) as client:
        supervisor = login(client, 'supervisor')
        worker = login(client, 'WORKER-001')
        payload = {'helmet_id': 'HELMET-001', 'worker_id': 'WORKER-001', 'timestamp': datetime.now(timezone.utc).isoformat(), 'gas_raw': 1700, 'simulated': True}
        sent = client.post('/api/readings', headers={'X-Device-Key': 'device-test-key'}, json=payload)
        assert sent.status_code == 201
        alerts = client.get('/api/alerts', headers=supervisor).json()
        assert len(alerts) == 1
        assert alerts[0]['detail'] == {'reading': 1700, 'threshold': 1500, 'unit': 'raw ADC'}
        assert alerts[0]['simulated'] is True
        alert_id = alerts[0]['id']
        assert client.post(f'/api/alerts/{alert_id}/acknowledge', headers=worker).status_code == 403
        assert client.post(f'/api/alerts/{alert_id}/acknowledge', headers=supervisor).json()['state'] == 'acknowledged'
        assert client.post(f'/api/alerts/{alert_id}/resolve', headers=supervisor, json={'notes': 'Area checked'}).json()['state'] == 'resolved'
        assert client.get('/api/alerts', headers=supervisor).json()[0]['resolutionNotes'] == 'Area checked'


def test_helmet_assignment_and_bounds(tmp_path, monkeypatch):
    setup(tmp_path, monkeypatch)
    payload = {'helmet_id': 'HELMET-001', 'worker_id': 'OTHER', 'timestamp': datetime.now(timezone.utc).isoformat(), 'gas_raw': 900}
    with TestClient(app) as client:
        assert client.post('/api/readings', headers={'X-Device-Key': 'device-test-key'}, json=payload).status_code == 409
        assert client.post('/api/readings', headers={'X-Device-Key': 'device-test-key'}, json={**payload, 'gas_raw': 9999}).status_code == 422
