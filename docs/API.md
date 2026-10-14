# MineSafe AI — API documentation

Base URL (hosted preview / Next.js backend): `http://<host>:3000`
Reference FastAPI backend: `http://<host>:8000` (same route shapes, `backend/app/main.py`)

All responses are JSON. Errors use `{ "error": "message", "details": [...] }` with proper HTTP status
codes: `400` bad request, `401` unauthenticated, `403` wrong role, `404` not found, `409` conflict,
`422` validation failed, `429` rate limited, `500` server error.

## Authentication

Session cookie `ms_session` (HMAC-signed, 12 h TTL, `httpOnly`). Passwords are stored as
`scrypt$salt$hash`. Set `APP_SECRET` in `.env`; never commit it.

```
POST /api/auth/login      { username, password, role? }        -> { user }
POST /api/auth/logout                                          -> { ok: true }
GET  /api/auth/me                                              -> { user, unreadNotifications }
```

Roles: `worker` (own helmet + SOS), `supervisor` (acknowledge/resolve, workers), `admin`
(everything, thresholds).

Device endpoints authenticate with the `x-device-key` header (must equal `DEVICE_API_KEY`).

## Core endpoints

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/api/dashboard` | any | Dashboard snapshot (totals, hazard status, helmets, latest alerts). `?advance=0` skips simulator tick |
| GET | `/api/stream` (SSE) | any | Live snapshot stream; `event: snapshot` every ~2.5 s, auto-reconnect |
| GET | `/api/readings/latest?helmet=HELMET-001` | any | Latest reading per helmet |
| GET | `/api/readings/history?helmet=&limit=60` | any | Historical series for charts |
| POST | `/api/ingest/sensor` | device | Telemetry ingestion (ESP32-S3 / MQTT bridge) |
| POST | `/api/helmets/HELMET-001/heartbeat` | device | Heartbeat; response contains fresh thresholds for the helmet |
| GET | `/api/helmets` · POST | any / admin | Helmet list & registration (`sensors.*` availability flags) |
| GET/PATCH/DELETE | `/api/helmets/{code}` | any / admin | Helmet detail & sensor configuration |
| GET/POST | `/api/workers` | any / sup+ | Worker list & creation (`?provisionLogin=1` also creates a worker app account) |
| GET/PATCH/DELETE | `/api/workers/{code}` | any / sup+ | Worker detail, helmet assignment, soft-deactivate |
| GET | `/api/alerts?status=&severity=&type=&q=&limit=` | any | Alert search; `runOfflineCheck=1` forces the watchdog |
| POST | `/api/alerts/{id}/acknowledge` | sup+ | `{ note? }` — records acknowledgement time |
| POST | `/api/alerts/{id}/resolve` | sup+ | `{ resolutionNotes }` (required, min 3 chars) |
| POST | `/api/alerts/sos` | any | SOS: `{ workerCode?, helmetCode?, location?, note?, source }` |
| GET/PATCH | `/api/notifications` | any | Notification list / mark read (`{ ids?: number[] }`) |
| POST | `/api/notifications/register` | any | `{ token, platform }` Expo push token registration |
| GET/PUT | `/api/settings/thresholds` | any / sup+ | Read & update safety thresholds (server-side validated) |
| GET | `/api/reports/summary?range=daily|weekly|monthly&from=&to=` | any | Report aggregates |
| GET | `/api/reports/export?status=&severity=&type=&q=` | any | CSV incident export |
| GET/POST | `/api/simulator` | any / sup+ | Simulated feed status; `{ action: enable|disable|inject, scenario, helmetCode }` |
| POST | `/api/maintenance/checks` | cron | Offline-helmet watchdog (`x-cron-secret`) |
| GET | `/api/health` | public | Health + integration status |

## Sensor ingestion payload

```json
POST /api/ingest/sensor
x-device-key: <DEVICE_API_KEY>
{
  "helmet_id": "HELMET-001",
  "worker_id": "WORKER-001",
  "timestamp": "2026-10-14T10:30:00Z",
  "gas_raw": 1250,
  "temperature_c": 32.5,
  "humidity_percent": 68,
  "pressure_hpa": 1012.4,
  "accel_x": 0.15,
  "accel_y": 0.22,
  "accel_z": 0.985,
  "battery_percent": 82,
  "location": "Zone-A / Level 2",
  "source": "device"
}
```

Rules enforced by the server:

* `helmet_id` required; every sensor field is optional but **at least one** must be present.
* Ranges: `gas_raw` 0–65535, `temperature_c` −40–150, `humidity_percent` 0–100,
  `pressure_hpa` 300–1200, accel ±16, `battery_percent` 0–100. Violations → `422`.
* Unknown fields are stripped. Malformed JSON → `400`.
* Accelerometer values are treated as **g**; if an axis exceeds 11 the engine assumes m/s² and
  converts (`/9.81`) so fall thresholds stay in g.
* `source` must be `device` or `simulated`; it is stored with the reading and surfaced in the UI so
  simulated test data can never be mistaken for real telemetry.
* Response contains `buzzerCommand: "ON" | "OFF"` so firmware can mirror the server-side decision.

## WebSocket / SSE

* Next.js backend: `GET /api/stream` (SSE) — frames `event: snapshot` with the full dashboard.
* FastAPI backend: `WS /ws/live`.

Clients that lose the stream fall back to polling `/api/dashboard` and display readings as **stale**
with their original timestamp.

## Rate limits (in-memory)

* login: 15 / minute / IP
* ingest: 600 / minute / IP
* sos: 20 / minute / IP
