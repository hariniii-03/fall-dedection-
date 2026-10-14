# ESP32-S3 integration guide

## 1. Hardware (typical build)

| Function | Part | ESP32-S3 pin (`esp32-firmware/http/config.h`) |
| --- | --- | --- |
| Air quality | MQ-135 (analog out) | GPIO4 (ADC1_CH3) |
| Temperature / humidity | DHT22 | GPIO5 |
| Accelerometer | MPU-6050 (I²C) | SDA GPIO41, SCL GPIO42 |
| Pressure (optional) | BMP280 (I²C, 0x76) | shared I²C bus |
| Battery sense | 2:1 resistor divider | GPIO6 |
| Local alarm | Buzzer + LED | GPIO7 / GPIO8 |
| SOS | Push button (to GND, pull-up) | GPIO9 |

> Not every helmet has every sensor. Set `HAS_*` to `0` in `config.h`; the firmware omits the field
> and the backend/UI mark that sensor **unavailable**. Missing data is never interpreted as "safe".

## 2. Firmware — Option A (HTTP)

Full setup guide: **`esp32-firmware/README.md`**.

1. Arduino IDE → Boards Manager → install **esp32 by Espressif Systems**.
2. Library Manager → install **ArduinoJson**, **DHT sensor library**,
   **Adafruit MPU6050**, **Adafruit Unified Sensor** (+ **Adafruit BMP280** if fitted).
3. Open `esp32-firmware/http/minesafe_helmet_http.ino`
   (Arduino allows only one `.ino` per sketch folder, so each transport has its own folder).
4. Fill `esp32-firmware/http/config.h`: `WIFI_SSID`, `WIFI_PASSWORD`, `API_BASE_URL`,
   `DEVICE_API_KEY`, `HELMET_ID`, `WORKER_ID`, and the `HAS_*` flags for fitted sensors.
5. Board: *ESP32S3 Dev Module*, USB CDC On Boot enabled → **Upload**.
6. **Test without hardware first:** `cd esp32-firmware/http && ./verify.sh`
7. Serial Monitor @ 115200. Expected output:

```
[wifi] connected, ip=192.168.1.77 rssi=-58
[minesafe] helmet ready
[http] /api/ingest/sensor -> 201 {"accepted":true,...}
```

## 3. Transport A — HTTP (default)

`POST {API_BASE_URL}/api/ingest/sensor` with header `x-device-key`:

```json
{
  "helmet_id": "HELMET-001",
  "worker_id": "WORKER-001",
  "timestamp": "2026-10-14T10:30:00Z",
  "gas_raw": 1250,
  "temperature_c": 32.5,
  "humidity_percent": 68,
  "accel_x": 0.15, "accel_y": 0.22, "accel_z": 0.985,
  "battery_percent": 82,
  "source": "device"
}
```

Heartbeat every 15 s: `POST /api/helmets/HELMET-001/heartbeat` with
`{ "battery_percent": 81, "firmware_version": "esp32-s3-1.0.0", "rssi": -58 }`.
The response `config` block carries the live thresholds — the helmet applies them, so safety limits
are changed centrally without reflashing.

SOS button: `POST /api/alerts/sos` with the **device key** header and the
`workerCode` / `helmetCode` fields (note: this endpoint uses `*Code` names, unlike
the telemetry payload which uses `helmet_id` / `worker_id`):

```json
POST /api/alerts/sos
x-device-key: <DEVICE_API_KEY>
{ "helmetCode": "HELMET-001", "workerCode": "WORKER-001", "note": "Physical SOS button", "source": "device" }
```

Omit `location` unless the helmet really has a position source — the app then
reports "Location source not integrated" instead of inventing coordinates.

## 4. Transport B — MQTT

Set `ACTIVE_TRANSPORT TRANSPORT_MQTT` and configure `MQTT_HOST/PORT/USER/PASS`, plus `MQTT_URL` on
the backend. Topic convention:

| Topic | Direction | Payload |
| --- | --- | --- |
| `minesafe/helmet/{HELMET-ID}/telemetry` | helmet → broker | same JSON as the HTTP body |
| `minesafe/helmet/{HELMET-ID}/heartbeat` | helmet → broker | `{ battery_percent, firmware_version, rssi }` |
| `minesafe/helmet/{HELMET-ID}/alert` | helmet → broker | `{ type, severity, measured_value }` (SOS / local rule) |
| `minesafe/config/thresholds` | backend → helmet (retained, QoS 1) | `{ gasWarning, gasCritical, temperatureWarning, ... }` |

A bridge (small Python/Node script or an EMQX webhook) republishes `.../telemetry` to
`POST /api/ingest/sensor`, which keeps all validation, detection and notification logic in one place.
QoS 1 is recommended; retained messages on the config topic let a rebooting helmet pick up thresholds
immediately.

## 5. Sensor notes & honesty

* **MQ-135**: the value sent (`gas_raw`) is the raw ADC count (0–4095 at 12-bit resolution,
  11 dB attenuation). It is an *air-quality indicator* — NOT an AQI, NOT ppm, NOT µg/m³.
  For calibrated values: pre-heat 24–48 h, record R0 in clean air, then
  `ratio = Rs/R0` and fit the MQ-135 log-log curve per target gas (CO₂-equivalent is a common
  approximation). Until that calibration is done the app deliberately labels the value "raw".
* **MPU-6050**: values are normalised to **g**. The engine auto-converts m/s² payloads.
* **Battery**: divider voltage → Li-ion percentage; calibrate the 3.3 V/4.2 V window for your pack.

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| `[wifi] FAILED` | SSID/password, 2.4 GHz only (ESP32 has no 5 GHz), signal strength in the mine |
| HTTP returns `401` | `DEVICE_API_KEY` in `config.h` ≠ `DEVICE_API_KEY` in backend `.env` |
| HTTP returns `404 helmet not registered` | Register the helmet (`POST /api/helmets`) or keep `AUTO_REGISTER_HELMETS=true` |
| HTTP returns `422` | A sensor value is out of range (e.g. gas_raw 65535 → MQ-135 wiring/heater cold) |
| Sensor `422` on all fields | Ensure at least one sensor field is present in the payload |
| Readings show `stale` in the app | Telemetry period too slow vs. `offlineTimeoutSeconds`; check heartbeat logs |
| No alerts although values are high | Thresholds raised in Settings, or alert cooldown still active (default 120 s) |
| Buzzer silent | `PIN_BUZZER` wiring, `soundEnabled` in Settings, and severity must be `critical` |
| MQ-135 readings drift | Heater pre-heat (24–48 h), stable 5 V supply, re-run R0 calibration |
