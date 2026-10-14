# MineSafe AI — ESP32-S3 firmware · Option A (HTTP)

The helmet POSTs JSON straight to the MineSafe REST backend. Simplest option, no
broker to run, works on any LAN where the backend is reachable.

```
esp32-firmware/http/
├── minesafe_helmet_http.ino   the sketch
├── config.h                   WiFi / backend / thresholds / pin map
└── verify.sh                  tests the transport without hardware
```

> Arduino allows only **one** `.ino` per sketch folder, so each transport lives
> in its own folder. Option B (MQTT) is described in
> `docs/ESP32_INTEGRATION.md` §4.

---

## 1. Wiring

| Function | Part | Pin (`config.h`) |
| --- | --- | --- |
| Air quality | MQ-135 **AO** (analog out) | GPIO4 |
| Temp / humidity | DHT22 data | GPIO5 |
| Battery sense | 2:1 divider from battery + | GPIO6 |
| Alarm | Active buzzer (via transistor) | GPIO7 |
| Alarm LED | LED + 220 Ω | GPIO8 |
| SOS | Push button to GND (internal pull-up) | GPIO9 |
| IMU / pressure | MPU-6050 (and optional BMP280) | SDA 41, SCL 42 |

Power notes: MQ-135 heater needs a **stable 5 V** and draws 150 mA+ — do not run
it from a 3.3 V pin. Common ground between the 5 V sensor supply and the ESP32-S3
is essential or every ADC reading drifts.

Not every helmet has every sensor. Set the `HAS_*` flags to `0`; the firmware
then **omits** that field so the app shows "unavailable" rather than a false
`0`. Keep at least one sensor enabled.

## 2. Install

**Arduino IDE**
1. *Boards Manager* → install **esp32 by Espressif Systems**.
2. *Library Manager* → install:
   **ArduinoJson** (v7), **DHT sensor library**, **Adafruit MPU6050**,
   **Adafruit Unified Sensor**, and **Adafruit BMP280** (only if fitted).
3. Copy the `http/` folder into your sketchbook and open
   `minesafe_helmet_http.ino` (it must sit next to its own `config.h`).
4. Edit `config.h`:
   - `WIFI_SSID`, `WIFI_PASSWORD` — 2.4 GHz only
   - `API_BASE_URL` — your backend, **no trailing slash**
   - `DEVICE_API_KEY` — must equal `DEVICE_API_KEY` in the backend `.env`
   - `HELMET_ID`, `WORKER_ID` — unique per helmet
5. *Tools → Board → ESP32S3 Dev Module*, *USB CDC On Boot → Enabled* → **Upload**.

**PlatformIO** (`platformio.ini`):

```ini
[env:esp32s3]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
lib_deps =
  bblanchon/ArduinoJson@^7.0.0
  adafruit/DHT sensor library@^1.4.4
  adafruit/Adafruit MPU6050@^2.2.4
  adafruit/Adafruit Unified Sensor@^1.1.11
build_flags =
  -D CORE_DEBUG_LEVEL=1
```

## 3. Verify the transport **before** flashing hardware

From the machine that can reach the backend:

```bash
cd esp32-firmware/http
./verify.sh                                     # against localhost:3000
BASE_URL=http://192.168.1.50:3000 ./verify.sh   # against a LAN backend
```

It checks: health, a valid firmware payload, `gas_raw` above the critical
threshold → `buzzerCommand: "ON"`, a packet with **no timestamp** (must still be
accepted), out-of-range / empty / non-ISO-timestamp payloads → `422`, heartbeat
returning the `config` block, and a device-key-authenticated SOS.

## 4. What you should see on the Serial Monitor (115200)

```
=== MineSafe AI helmet · Option A (HTTP) ===
helmet=HELMET-001 worker=WORKER-001 fw=esp32-s3-1.0.0
backend=http://192.168.1.50:3000
[wifi] connected ip=192.168.1.77 rssi=-58
[imu] MPU-6050 ready
[ntp] time synchronised
[http] POST /api/helmets/HELMET-001/heartbeat -> 200 {"helmetId":"HELMET-001",...
[config] thresholds synced (gas 900/1400, temp 38.0/43.0, impact 2.60g)
[minesafe] helmet ready
[http] POST /api/ingest/sensor -> 201 {"accepted":true,...,"buzzerCommand":"OFF"}
```

Press the SOS button and you should see `[sos] -> 201`.

## 5. How the pieces work

| Behaviour | Detail |
| --- | --- |
| Telemetry | Every `TELEMETRY_INTERVAL_MS` (2 s default) → `POST /api/ingest/sensor` |
| Heartbeat | Every 15 s → `POST /api/helmets/{ID}/heartbeat` |
| Threshold sync | The **heartbeat response** carries a `config` block; the firmware applies it, so changing limits in the app's Settings takes effect on the helmet without reflashing |
| Buzzer | Fires locally on `gas_raw >= critical`, `temp >= critical`, or a detected fall; the backend's `buzzerCommand` also triggers it so server-side rules are mirrored |
| Fall detection | Free-fall (`|a|` ≤ `TH_FALL_FREEFALL_G`) then impact (`|a|` ≥ `TH_FALL_IMPACT_G`) within `FALL_WINDOW_MS`, debounced 5 s |
| Reconnect | Exponential backoff 3 s → 60 s; NTP re-synced after any drop |
| Timestamp | Only sent when NTP time is valid, otherwise **omitted** (a non-ISO string would be rejected with `422`) |

## 6. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `[wifi] FAILED` | Wrong SSID/password, or a **5 GHz-only** network. ESP32-S3 is 2.4 GHz. Mines are RF-hostile — check RSSI. |
| `-> 401` on every post | `DEVICE_API_KEY` in `config.h` ≠ `DEVICE_API_KEY` in the backend `.env`. |
| `-> 404` "not registered" | Set `AUTO_REGISTER_HELMETS=true` in the backend `.env`, or register the helmet via `POST /api/helmets`. |
| `-> 422` on every packet | A sensor value is out of range. `gas_raw: 4095` usually means the MQ-135 AO pin is floating or the heater is cold. |
| `-> 422` "At least one sensor field" | All `HAS_*` flags are `0`, or every read failed. |
| `-> 429` | Rate limit (600 posts/min/IP). Lower `TELEMETRY_INTERVAL_MS` abuse. |
| HTTP fails, `-1` | Wrong `API_BASE_URL`, or the phone/PC and helmet are on different subnets / AP isolation is on. |
| Gas reading stuck near 0 or 4095 | Wiring on AO, or `analogSetPinAttenuation` missing — needs `ADC_11db` for the 0–3.3 V range. |
| Gas value climbs then never settles | MQ-135 needs a **24–48 h burn-in**; it also drifts with temperature/humidity. |
| Humidity always `nan` | DHT22 wiring/pull-up (10 kΩ on DATA), or reads faster than ~2 s apart. |
| Fall alerts on every bump | Raise `TH_FALL_IMPACTG`/`fallImpactG` in app Settings; the free-fall-then-impact rule already rejects isolated knocks. |
| No fall alert when dropped | Lower `fallImpactG`, or check the MPU-6050 address/orientation (`|a|` in the app should read ≈1.00 g at rest). |
| Buzzer silent | Wiring on GPIO7, or severity is only `warning` (buzzer fires on `critical`). |
| Helmet shows offline in the app | It stopped posting for longer than `offlineTimeoutSeconds` (default 90 s). |

## 7. Calibration honesty

`gas_raw` is the **raw MQ-135 analog count**. The app deliberately labels it
"raw" and never presents it as an AQI or a ppm value. To publish real
concentrations you must: pre-heat 24–48 h, measure `R0` in clean air, compute
`ratio = Rs/R0`, then apply the MQ-135 log-log curve for a specific target gas.
Until that is implemented the value is an air-quality *indicator* only.
