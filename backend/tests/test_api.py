from fastapi.testclient import TestClient
from backend.app import app, init_db


def test_requires_auth(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_URL', f'sqlite:///{tmp_path}/safe.db')
    init_db()
    with TestClient(app) as client:
        assert client.get('/api/alerts').status_code == 401
        assert client.post('/api/readings', json={}).status_code == 401


def test_payload_validation(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_URL', f'sqlite:///{tmp_path}/safe.db')
    init_db()
    with TestClient(app) as client:
        assert client.post('/api/readings', headers={'X-Device-Key': 'wrong'}, json={'helmet_id': 'X'}).status_code == 401
