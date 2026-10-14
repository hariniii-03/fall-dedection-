# MineSafe AI — Smart Mining Helmet Safety Monitoring System

ECE mini-project: **"Smart Helmet for Checking Air Quality Index and Fall Detection in Mining"**.
MineSafe AI is a working end-to-end prototype — not a UI mockup — with real navigation, data handling,
alert generation, notification management, persistence and a documented path to physical hardware.

```
minesafe-ai/
├── src/                 # ▶ RUNNING APP: Next.js (App Router) mobile-style client + REST backend + SSE
│   ├── app/(app)/       #   Dashboard · Live Monitoring · Alerts · Workers · Reports · Settings · More
│   ├── app/api/         #   auth, ingest, readings, alerts, sos, workers, helmets, notifications,
│   │                    #   settings/thresholds, reports, simulator, maintenance, health, stream
│   ├── components/      #   reusable UI primitives + live-data provider
│   ├── db/schema.ts     #   Drizzle schema (users, workers, helmets, readings, alerts, notifications…)
│   └── lib/safety/      #   rule engine + modular AI anomaly layer (pure, unit-tested)
├── mobile/              # React Native (Expo) Android app source
├── backend/             # Python FastAPI reference backend (same contract) + pytest suite
├── esp32-firmware/      # ESP32-S3 firmware (HTTP or MQTT) + config
├── database/            # schema.sql (DDL), seeding is automatic on first run
├── docs/                # API.md · ESP32_INTEGRATION.md · PUSH_NOTIFICATIONS.md · TESTING.md
├── tests/               # node:test safety-logic tests + HTTP smoke tests
├── .env.example
└── README.md
```

---

## 1. Quick start (the running app)

```bash
cp .env.example .env          # set DATABASE_URL + APP_SECRET
npm install
npx drizzle-kit push          # create tables
npm run dev                   # http://localhost:3000
```

The database is seeded automatically on first request (demo users, 4 helmets/workers, 45 minutes of
**labelled simulated** telemetry, one resolved incident). `HELMET-004` is intentionally offline so the
offline-alert path is demonstrable immediately.

| Role | Username | Password |
| --- | --- | --- |
| Supervisor | `supervisor` | `Super@123` |
| Administrator | `admin` | `Admin@123` |
| Worker | `worker` | `Worker@123` |

## 2. Running the mobile app (React Native + Expo)

```bash
cd mobile
npm install
# point the app at your backend:
#   Android emulator  -> http://10.0.2.2:3000 (default fallback)
#   physical device   -> edit mobile/app.json "extra.apiBaseUrl" to your PC's LAN IP
npx expo start              # press `a` for Android
```

Screens: Login (role selector) · Dashboard · Live Monitoring · Alerts · Workers · Reports · Settings.
Build a standalone APK with `eas build -p android --profile preview` (see `mobile/README.md`).

## 3. Running the FastAPI backend (optional reference service)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000     # docs at /docs
pytest -q                                     # payload validation, thresholds, fall traces
```

It exposes the same REST contract plus `WS /ws/live`, so the Expo app and ESP32-S3 firmware can target
either backend (`mobile/app.json` → `apiBaseUrl`, `esp32-firmware/http/config.h` → `API_BASE_URL`).

## 4. Connecting the ESP32-S3 helmet

1. Install the Arduino libraries listed in `docs/ESP32_INTEGRATION.md`.
2. Edit `esp32-firmware/http/config.h`: WiFi, `API_BASE_URL`, `DEVICE_API_KEY` (must equal `DEVICE_API_KEY`
   in `.env`), and set `HAS_*` flags for the sensors actually fitted.
3. Board **ESP32S3 Dev Module** → Upload → Serial Monitor @115200.
4. Telemetry flows to `POST /api/ingest/sensor`; heartbeats every 15 s return the current thresholds so
   safety limits are remotely configurable without reflashing.
5. MQTT instead of HTTP: set `ACTIVE_TRANSPORT TRANSPORT_MQTT` and `MQTT_URL` on the backend. Topics:
   `minesafe/helmet/{ID}/telemetry`, `.../heartbeat`, `.../alert`, `minesafe/config/thresholds`.

Troubleshooting table: `docs/ESP32_INTEGRATION.md` §6.

## 5. Configuring push notifications

1. `cd mobile && eas login && eas build:configure` → fills `extra.eas.projectId`.
2. Add `EXPO_ACCESS_TOKEN` to the backend `.env` (+ optional `EXPO_PUSH_ENABLED`,
   `EXPO_PUSH_CRITICAL_ONLY`).
3. `eas build -p android --profile preview`, install, log in — the device token is registered
   automatically via `POST /api/notifications/register`.
4. Without credentials the backend stores `deliveryStatus = "skipped"` and the client falls back to
   **local** notifications (development mode). Details: `docs/PUSH_NOTIFICATIONS.md`.

---

## What works right now

* **Auth & RBAC** — scrypt-hashed passwords, HMAC-signed session cookie, worker/supervisor/admin
  permissions on every endpoint, logout, login rate limiting.
* **Live monitoring** — SSE stream (`/api/stream`) with automatic polling fallback, stale-data
  marking with original timestamps, gauges + sparkline charts, per-helmet selection.
* **Detection engine** — deterministic rules (gas, temperature, humidity, fall, low battery, offline)
  **separate from** a transparent rolling-z-score anomaly detector; every alert stores the rule id,
  measured value, threshold, sensor snapshot and an explanation.
* **Alert lifecycle** — duplicate prevention via `dedupeKey`, configurable cooldowns, acknowledge
  (with note) and resolve (mandatory notes), history never deleted, ack/resolve timings recorded.
* **Emergency SOS** — from the app, from the helmet button, or via API; supervisor emergency-response
  screen; location shown only when a location source is integrated.
* **Notification centre** — active / critical / warning / resolved filters, search, read/unread,
  delivery status per recipient, Expo push sender wired in (needs credentials).
* **Worker & helmet management** — create/edit/deactivate workers, helmet assignment, sensor
  availability flags per helmet, firmware/heartbeat/battery status.
* **Reports** — 24 h / 7 day / 30 day summaries, per-day bar chart, averages & peaks, ack/resolve
  timings, device-vs-simulated packet split, CSV export.
* **Settings** — validated thresholds, notification prefs, sound/vibration, emergency contacts,
  simulated-feed switch, one-tap test scenarios, system event log.
* **Testing** — `tests/safety.test.mjs` (rules, fall traces, payload ranges), `tests/api.smoke.test.mjs`
  (HTTP integration), `backend/tests/test_detection.py` (pytest).

## What still needs hardware, credentials or external services

| Item | Blocked on |
| --- | --- |
| Real ESP32-S3 telemetry | flashing the firmware + WiFi in the mine |
| Calibrated AQI / ppm values | MQ-135 R0 calibration & curve fit (raw counts are shown today) |
| Remote push delivery | `EXPO_ACCESS_TOKEN`, Expo project id, standalone Android build |
| Pressure readings | BMP280 fitted + `HAS_BMP280 1` (field is disabled otherwise) |
| MQTT threshold sync | an MQTT broker (`MQTT_URL`) and the bridge republishing to `/api/ingest/sensor` |
| Trained ML anomaly model | labelled real helmet data (the detector interface is ready) |
| Background watchdog | a cron/scheduler calling `POST /api/maintenance/checks` |

## Honesty / limitations

* The MQ-135 value is displayed as a **raw air-quality indicator** — never presented as an AQI or a
  gas concentration, because no calibration has been performed.
* Simulated data is always labelled (`source: "simulated"`, "SIMULATED feed ON" badge, 🧪 badges) and
  can be switched off in Settings before hardware trials.
* Missing telemetry is treated as **UNKNOWN**, never as safe.
* No machine-learning accuracy is claimed: the anomaly layer is a statistical baseline detector with a
  pluggable interface for a model trained on real data.

## Validation / tests

```bash
npm run typecheck            # tsc --noEmit
npm run build                # production build
npm test                     # node --test tests/ (safety logic)
BASE_URL=http://localhost:3000 npm test -- tests/api.smoke.test.mjs
cd backend && pytest -q      # Python detection tests
```
