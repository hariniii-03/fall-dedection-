# Testing procedures

## 1. Backend / logic tests (no hardware)

```bash
# Python reference backend: validation, thresholds, fall traces
cd backend && pip install -r requirements.txt && pytest -q

# Web/backend TypeScript: pure detection logic
npm test           # node --test tests/*.test.mjs
```

`tests/safety.test.mjs` covers:
* gas warning / critical thresholds, temperature, humidity, low battery
* fall sequences: free-fall+impact (detected), isolated bump (not a fall), noise (not a fall)
* z-score anomaly detector baseline behaviour
* payload range validation (mirrors the zod schema ranges used by `/api/ingest/sensor`)

`tests/api.smoke.test.mjs` is an HTTP integration test against a running server
(`BASE_URL=http://localhost:3000 npm test -- tests/api.smoke.test.mjs`): login → ingest valid and
malformed payloads → assert alert creation, acknowledgement and resolution.

## 2. Simulated-scenario tests in the app

Login as **supervisor** → *Settings → Data source* → pick a helmet, then:

| Button | Expected result |
| --- | --- |
| **Test gas alert** | Critical alert, red dashboard banner, buzzer command `ON` for the helmet, notification for every supervisor, helmet status turns critical |
| **Test fall alert** | `EMERGENCY: A possible fall was detected…` with the accelerometer trace in the alert detail; emergency response screen offers Acknowledge / Resolve |
| **Test temperature** | Warning/critical temperature alert, recorded in history |
| **Test low battery** | Low-battery warning + battery tile turns red |
| **Test SOS** | Critical SOS alert with worker identity + timestamp; location shown only if provided |

Every injected reading is stored with `source = "simulated"` and the UI shows **🧪 Simulated data**.

## 3. Offline alert test

1. *Settings → Data source* → turn the simulated feed **OFF**.
2. Wait `offlineTimeoutSeconds` (default 90 s), or call:
   ```bash
   curl -X POST http://localhost:3000/api/maintenance/checks -H "x-cron-secret: $CRON_SECRET"
   ```
3. The helmet becomes grey/offline and an alert
   *"Helmet … has not transmitted for Ns"* is raised. Missing data is shown as **UNKNOWN, never safe**.

## 4. Push notification test

```bash
# while a supervisor session is open in the browser or the Expo app
curl -X POST http://localhost:3000/api/simulator \
  -H 'content-type: application/json' \
  -d '{"action":"inject","scenario":"gas"}'
```

* With `EXPO_ACCESS_TOKEN` set → notification arrives on the device, `notifications.deliveryStatus = sent`.
* Without it → in-app + local notification, `deliveryStatus = skipped` with the reason (see
  `docs/PUSH_NOTIFICATIONS.md`).

## 5. ESP32-S3 hardware test

1. Run `cd esp32-firmware/http && ./verify.sh` first, then flash `minesafe_helmet_http.ino`; open the Serial Monitor @115200.
2. Confirm `[http] /api/ingest/sensor -> 201`.
3. Hold a lighter/burnt match ~10 cm from the MQ-135 (in a **safe, ventilated** area) → dashboard gas
   value climbs and a gas alert is raised; helmet buzzer sounds.
4. Tilt/shake the helmet sharply (impact > `fallImpactG`) → fall alert with the accelerometer trace.
5. Power off the helmet → after `offlineTimeoutSeconds` the offline alert fires.
6. Press the physical SOS button → SOS alert appears in the notification centre.

## 6. Manual regression checklist

- [ ] Login rejects a wrong role/password (`401`, `403`).
- [ ] Worker account sees its own helmet and SOS but cannot acknowledge alerts (`403`).
- [ ] Threshold save with `gasCritical <= gasWarning` returns `422` with field-level issues.
- [ ] Alert history survives acknowledgement and resolution (no auto-delete).
- [ ] CSV export downloads and includes acknowledgement/resolution timings.
- [ ] Stopping the server shows the "Reconnecting…" state; restarting resumes the live stream.
- [ ] Readings are labelled `device` or `simulated` everywhere they are displayed.
