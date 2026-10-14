# MineSafe AI — first increment

This branch contains the inherited ESP32-S3 fall detector (PlatformIO, MPU6050, TinyML, buzzer and NeoPixel); see the original repository documentation and LICENSE for attribution. The existing firmware was not modified in this increment. The new mobile UI was already present when this increment began; this work adds an initial API. Do not use as a certified mine safety system.

## Start the backend

From the repository root:

```bash
python -m venv .venv
# Activate the environment using your operating system's shell procedure.
python -m pip install -r backend/requirements.txt
export JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export ADMIN_PASSWORD='choose-a-private-password-of-at-least-12-characters'
python -m backend.bootstrap
unset ADMIN_PASSWORD
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

Set `DATABASE_URL` for another database (default: `sqlite:///./minesafe.db`). Never commit credentials; `.env` is ignored by the existing repository. The OpenAPI schema is served at `/docs`. Bootstrap creates the first administrator only. This increment does **not** yet provide a supported worker/helmet provisioning interface, so login and helmet ingestion cannot be fully exercised until the next phase. Run `python -m pytest backend/tests` for the current API tests; execution has not yet been verified in this environment.

## Start the Android app

```bash
cd mobile
npm install
npx expo start --android
```

The app expects the backend at `http://10.0.2.2:8000` on an Android emulator. For a physical device, set `expo.extra.apiBaseUrl` in `mobile/app.json` to your reachable HTTPS backend URL and rebuild. Unencrypted HTTP should not be used for deployed helmet or mobile traffic. The app includes an Alerts screen with search, filters, SOS, acknowledgement and resolution controls; data is polled every 10 seconds. Simulation is explicitly labeled and must not be mistaken for live readings. The app does not yet register for push notifications or open a WebSocket.

## Helmet interface (not connected yet)

An assigned helmet will POST JSON to `/api/readings` with a per-helmet `X-Device-Key`, UTC ISO-8601 `timestamp`, `helmet_id`, matching `worker_id`, and optional `gas_raw`, `temperature_c`, `humidity_percent`, `accel_x`, `accel_y`, `accel_z`, `battery_percent` and `pressure_hpa`. Raw MQ-135 values are ADC units, **not AQI**. Hardware firmware networking and per-device provisioning are pending. Existing local buzzer remains independent of the backend.

## Remaining work

Remote Expo push (including credentials and real-device validation), fall-event ingestion, offline incident scheduling, persisted threshold configuration, WebSocket streaming, reports/CSV, history, worker/helmet administration, database migrations, hardware sensor drivers, HTTPS deployment, security hardening, and full tests are not complete. Current API authentication, threshold alerts and incident history are preliminary and **not yet verified by executed tests**.
