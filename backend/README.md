# MineSafe AI — FastAPI backend (reference implementation)

The hosted preview in this repository runs the **Next.js backend** (`src/app/api/**`) because that
is the runtime the preview environment provides. This folder contains the equivalent
**Python FastAPI** backend described in the project brief, with the Python AI/anomaly module,
WebSocket streaming and the same REST contract. You can run either one against the same ESP32-S3
firmware and the Expo mobile app.

## Run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
```

Environment (`.env`):

```
DATABASE_URL=sqlite:///./minesafe.db     # or postgresql+psycopg://user:pass@host/db
DEVICE_API_KEY=change-me                 # must match esp32-firmware/http/config.h
CORS_ORIGINS=http://localhost:8081
AUTO_REGISTER_HELMETS=true
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Prototype login (worker / supervisor / admin) |
| GET/POST | `/api/workers` | Worker management |
| POST | `/api/helmets` | Helmet registration (sensor availability configurable) |
| POST | `/api/helmets/{code}/heartbeat` | Heartbeat + threshold sync to the helmet |
| POST | `/api/ingest/sensor` | ESP32-S3 telemetry ingestion (validated) |
| GET | `/api/readings/latest` / `/api/readings/history` | Latest + historical readings |
| GET/POST | `/api/alerts` | Alert list / manual alert creation |
| POST | `/api/alerts/{id}/acknowledge` | Supervisor acknowledgement |
| POST | `/api/alerts/{id}/resolve` | Resolve with mandatory notes |
| GET/PUT | `/api/settings/thresholds` | Safety threshold configuration |
| POST | `/api/maintenance/checks` | Offline-helmet watchdog pass |
| WS | `/ws/live` | Live sensor stream (WebSocket) |
| GET | `/api/health` | Health probe |

## Layout

```
backend/
  app/main.py        FastAPI routes, WebSocket, dependency-based auth
  app/models.py      SQLAlchemy models + Pydantic payload schemas
  app/detection.py   Rule engine + pluggable anomaly detector interface
  tests/             pytest suite (payload validation, thresholds, fall traces)
```

## Notes / honesty

* Login is a demo stub. Replace with hashed credentials + JWT before any real deployment.
* `detection.RollingZScoreDetector` is a statistical baseline detector, **not** a trained model.
  Drop a scikit-learn model into `AnomalyDetector.score()` when real helmet data is available.
* Push notifications are not wired here; see `docs/PUSH_NOTIFICATIONS.md` and the Next.js
  implementation in `src/lib/notifications.ts`, which includes the Expo push sender.
