/**
 * ============================================================================
 *  MineSafe AI — Smart Mining Helmet firmware  ·  OPTION A: HTTP
 * ============================================================================
 *  Reads MQ-135 / DHT22 / MPU-6050 (+ optional BMP280 and battery divider),
 *  evaluates local safety rules, and POSTs telemetry to the MineSafe backend
 *  over HTTP. Local buzzer + LED fire on critical conditions; the backend's
 *  `buzzerCommand` response can also drive the buzzer.
 *
 *  WIRING, LIBRARIES AND TROUBLESHOOTING: see esp32-firmware/README.md
 *
 *  HONESTY NOTES
 *  -------------
 *  * `gas_raw` is the RAW MQ-135 analog value (0-4095 @ 12-bit, 11 dB atten).
 *    It is an air-quality INDICATOR, not an AQI and not a ppm concentration.
 *    Calibrate against a reference instrument before publishing real values.
 *  * Accelerometer values are sent in g. The backend converts m/s^2 payloads
 *    automatically, but sending g keeps thresholds unambiguous.
 *  * Fields for sensors that are not fitted are OMITTED, never sent as 0, so
 *    "missing" is never read as "safe".
 *  * `timestamp` is only sent when NTP time is actually available. Without it
 *    the field is omitted and the backend uses its own receive time — sending a
 *    non-ISO string would make the backend reject the packet with HTTP 422.
 *
 *  LIBRARY VERSIONS
 *  ----------------
 *  Written for ArduinoJson v7 (`JsonDocument`). On ArduinoJson v6 replace
 *  `JsonDocument doc;` with `DynamicJsonDocument doc(1024);`.
 * ============================================================================
 */

#include "config.h"

#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

#if HAS_DHT22
#include "DHT.h"
static DHT dht(PIN_DHT, DHT22);
#endif

#if HAS_MPU6050
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
static Adafruit_MPU6050 mpu;
static bool imuReady = false;
#endif

#if HAS_BMP280
#include <Adafruit_BMP280.h>
static Adafruit_BMP280 bmp;
static bool bmpReady = false;
#endif

// "not fitted / not read" sentinels
static const float NO_VALUE   = -1.0f;
static const float NO_AXIS    = -999.0f;
static const float NO_TEMP    = -1000.0f;

// ------------------------------- state -----------------------------------
static const String firmwareVersion = FIRMWARE_VERSION;
static unsigned long lastTelemetryMs  = 0;
static unsigned long lastHeartbeatMs  = 0;
static unsigned long retryBackoffMs   = RETRY_BACKOFF_MS;
static unsigned long buzzerUntilMs    = 0;
static unsigned long lastFallAlertMs  = 0;
static unsigned long lastSosMs        = 0;
static bool wifiWasConnected          = false;
static bool timeSynced                = false;
static bool lastPacketWasCritical     = false;

// Server-side thresholds, refreshed from every heartbeat response.
static float cfgGasWarning    = TH_GAS_WARNING;
static float cfgGasCritical   = TH_GAS_CRITICAL;
static float cfgTempWarning   = TH_TEMP_WARNING;
static float cfgTempCritical  = TH_TEMP_CRITICAL;
static float cfgBatteryLow    = TH_BATTERY_LOW;
static float cfgFallImpactG   = TH_FALL_IMPACT_G;
static float cfgFallFreeFallG = TH_FALL_FREEFALL_G;

// Fall-detection scratchpad
static float freeFallStartMs = -1.0f;

// ===========================================================================
//  small helpers
// ===========================================================================
static float accelMagnitudeG(float ax, float ay, float az) {
  return sqrtf(ax * ax + ay * ay + az * az);
}

static float readBatteryPercent() {
#if HAS_BATTERY_DIVIDER
  const int raw = analogRead(PIN_BATTERY);
  // 3.3 V ADC reference, 2:1 divider => Vbat = raw/4095 * 3.3 * 2
  const float vbat = (raw / 4095.0f) * 3.3f * 2.0f;
  // Li-ion window 3.3 V .. 4.2 V. Adjust for your pack / divider ratio.
  const float pct = ((vbat - 3.3f) / (4.2f - 3.3f)) * 100.0f;
  return constrain(pct, 0.0f, 100.0f);
#else
  return NO_VALUE;
#endif
}

static void buzzerAlert(unsigned long durationMs) {
  buzzerUntilMs = millis() + durationMs;
  digitalWrite(PIN_BUZZER, HIGH);
  digitalWrite(PIN_LED, HIGH);
}

static void buzzerLoop() {
  if (buzzerUntilMs != 0 && millis() > buzzerUntilMs) {
    digitalWrite(PIN_BUZZER, LOW);
    digitalWrite(PIN_LED, LOW);
    buzzerUntilMs = 0;
  }
}

// ===========================================================================
//  WiFi + time
// ===========================================================================
static bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.printf("[wifi] connecting to \"%s\"", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);          // lower latency, fewer dropped posts
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected ip=%s rssi=%d\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    if (!wifiWasConnected) {     // reconnected after a drop
      Serial.println("[wifi] link restored");
      retryBackoffMs = RETRY_BACKOFF_MS;
      timeSynced = false;        // re-sync NTP after reconnect
    }
    wifiWasConnected = true;
    return true;
  }

  Serial.println("[wifi] FAILED - telemetry will be retried with backoff");
  wifiWasConnected = false;
  return false;
}

/** Ask NTP for UTC time. Returns false when time is not usable yet. */
static bool syncTime() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  struct tm ti;
  // Up to 4 s for NTP; do not block the loop indefinitely.
  if (getLocalTime(&ti, 4000) && ti.tm_year > (2020 - 1900)) {
    timeSynced = true;
    Serial.println("[ntp] time synchronised");
  } else {
    timeSynced = false;
    Serial.println("[ntp] no time yet - timestamp omitted from payloads");
  }
  return timeSynced;
}

static bool isoTimestamp(char *buf, size_t len) {
  if (!timeSynced) return false;
  struct tm ti;
  if (!getLocalTime(&ti, 20)) return false;
  return strftime(buf, len, "%Y-%m-%dT%H:%M:%SZ", &ti) != 0;
}

// ===========================================================================
//  HTTP transport
// ===========================================================================
static int postJson(const char *path, const String &body, String &response) {
  if (WiFi.status() != WL_CONNECTED) return -1;

  HTTPClient http;
  http.setReuse(false);
  http.setTimeout(HTTP_TIMEOUT_MS);

  const String url = String(API_BASE_URL) + path;
  if (!http.begin(url)) {
    Serial.printf("[http] begin() failed for %s\n", path);
    return -1;
  }
  http.addHeader("Content-Type", "application/json");
  if (String(DEVICE_API_KEY).length() > 0) {
    http.addHeader("x-device-key", DEVICE_API_KEY);
  }

  const int code = http.POST(body);
  if (code > 0) {
    response = http.getString();
    Serial.printf("[http] POST %s -> %d %s\n", path, code, response.c_str());
  } else {
    Serial.printf("[http] POST %s failed: %s\n", path, http.errorToString(code).c_str());
  }
  http.end();
  return code;
}

// ===========================================================================
//  remote configuration (from the heartbeat response)
// ===========================================================================
static void applyConfig(JsonObject cfg) {
  if (!cfg["gasWarning"].isNull())        cfgGasWarning    = cfg["gasWarning"];
  if (!cfg["gasCritical"].isNull())       cfgGasCritical   = cfg["gasCritical"];
  if (!cfg["temperatureWarning"].isNull()) cfgTempWarning  = cfg["temperatureWarning"];
  if (!cfg["temperatureCritical"].isNull()) cfgTempCritical = cfg["temperatureCritical"];
  if (!cfg["batteryLow"].isNull())        cfgBatteryLow    = cfg["batteryLow"];
  if (!cfg["fallImpactG"].isNull())       cfgFallImpactG   = cfg["fallImpactG"];
  if (!cfg["gasUnit"].isNull()) {
    Serial.printf("[config] gas unit reported by backend: %s\n", cfg["gasUnit"].as<const char *>());
  }
  Serial.printf("[config] thresholds synced (gas %.0f/%.0f, temp %.1f/%.1f, impact %.2fg)\n",
                cfgGasWarning, cfgGasCritical, cfgTempWarning, cfgTempCritical, cfgFallImpactG);
}

// ===========================================================================
//  telemetry
// ===========================================================================
static bool sendTelemetry(float gasRaw, float tempC, float hum, float press,
                          float ax, float ay, float az, float battery) {
  JsonDocument doc;
  doc["helmet_id"] = HELMET_ID;
  doc["worker_id"] = WORKER_ID;

  char ts[32];
  if (isoTimestamp(ts, sizeof(ts))) {
    doc["timestamp"] = ts;   // omitted entirely when NTP is unavailable
  }

  bool anyField = false;

#if HAS_MQ135
  if (gasRaw != NO_VALUE) { doc["gas_raw"] = gasRaw; anyField = true; }
#endif
#if HAS_DHT22
  if (tempC != NO_TEMP) { doc["temperature_c"] = tempC; anyField = true; }
  if (hum != NO_VALUE)  { doc["humidity_percent"] = hum; anyField = true; }
#endif
#if HAS_BMP280
  if (press != NO_VALUE) { doc["pressure_hpa"] = press; anyField = true; }
#endif
#if HAS_MPU6050
  if (ax != NO_AXIS)  { doc["accel_x"] = ax; anyField = true; }
  if (ay != NO_AXIS)  { doc["accel_y"] = ay; anyField = true; }
  if (az != NO_AXIS)  { doc["accel_z"] = az; anyField = true; }
#endif
#if HAS_BATTERY_DIVIDER
  if (battery != NO_VALUE) { doc["battery_percent"] = battery; anyField = true; }
#endif

  // The backend requires at least one sensor field; sending nothing is a bug,
  // not a measurement.
  if (!anyField) {
    Serial.println("[telemetry] no sensor fields available - nothing sent");
    return false;
  }

  doc["source"] = "device";    // never "simulated" from real hardware

  String body;
  serializeJson(doc, body);

  String response;
  const int code = postJson(API_INGEST_PATH, body, response);

  if (code == 200 || code == 201) {
    retryBackoffMs = RETRY_BACKOFF_MS;   // reset backoff on success
    lastTelemetryMs = millis();

    // The backend mirrors its own decision back so firmware and app always
    // agree on whether the buzzer should sound.
    JsonDocument ack;
    if (deserializeJson(ack, response) == DeserializationError::Ok) {
      const bool critical = strcmp(ack["buzzerCommand"] | "OFF", "ON") == 0;
      if (critical && !lastPacketWasCritical) buzzerAlert(4000);
      lastPacketWasCritical = critical;
    }
    return true;
  }

  if (code == 422) {
    // Payload rejected as invalid: log loudly but do not hammer the server.
    Serial.println("[telemetry] REJECTED 422 - check sensor ranges / payload keys");
    retryBackoffMs = RETRY_BACKOFF_MS;
    lastTelemetryMs = millis();
    return false;
  }

  if (code == 401) {
    Serial.println("[telemetry] REJECTED 401 - DEVICE_API_KEY mismatch with backend .env");
  }
  return false;
}

// ===========================================================================
//  heartbeat (also the threshold-sync channel)
// ===========================================================================
static void sendHeartbeat() {
  JsonDocument doc;
  doc["helmet_id"]        = HELMET_ID;
  doc["firmware_version"] = firmwareVersion;

  const float battery = readBatteryPercent();
  if (battery != NO_VALUE) doc["battery_percent"] = battery;
  if (WiFi.status() == WL_CONNECTED) doc["rssi"] = WiFi.RSSI();

  String body;
  serializeJson(doc, body);

  char path[96];
  snprintf(path, sizeof(path), API_HEARTBEAT_PATH, HELMET_ID);

  String response;
  const int code = postJson(path, body, response);
  if (code != 200) return;

  lastHeartbeatMs = millis();
  JsonDocument parsed;
  if (deserializeJson(parsed, response) != DeserializationError::Ok) return;

  JsonObject cfg = parsed["config"];
  if (!cfg.isNull()) applyConfig(cfg);
}

// ===========================================================================
//  SOS button
// ===========================================================================
static void sendSos() {
  // NOTE: the backend SOS schema uses workerCode / helmetCode (NOT worker_id /
  // helmet_id), and authenticates the helmet with the x-device-key header.
  JsonDocument doc;
  doc["helmetCode"] = HELMET_ID;
  doc["workerCode"] = WORKER_ID;
  doc["note"]       = "Physical SOS button on helmet";
  doc["source"]     = "device";
  // No `location` field: this build has no GPS/position source, so the app
  // reports "Location source not integrated" instead of inventing one.

  String body;
  serializeJson(doc, body);

  String response;
  const int code = postJson(API_SOS_PATH, body, response);
  Serial.printf("[sos] -> %d %s\n", code, response.c_str());
  buzzerAlert(2000);
}

// ===========================================================================
//  fall detection (local rule: free-fall phase then impact inside the window)
// ===========================================================================
static bool detectFall(float magG) {
  const unsigned long now = millis();

  if (magG <= cfgFallFreeFallG) {
    freeFallStartMs = (float)now;          // entering free fall
    return false;
  }

  if (freeFallStartMs >= 0.0f && magG >= cfgFallImpactG &&
      (now - (unsigned long)freeFallStartMs) <= (unsigned long)FALL_WINDOW_MS) {
    freeFallStartMs = -1.0f;
    if (now - lastFallAlertMs > FALL_DEBOUNCE_MS) {
      lastFallAlertMs = now;
      return true;
    }
  }

  if (freeFallStartMs >= 0.0f && (now - (unsigned long)freeFallStartMs) > 2000UL) {
    freeFallStartMs = -1.0f;               // stale free-fall marker
  }
  return false;
}

// ===========================================================================
//  setup / loop
// ===========================================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== MineSafe AI helmet · Option A (HTTP) ===");
  Serial.printf("helmet=%s worker=%s fw=%s\n", HELMET_ID, WORKER_ID, FIRMWARE_VERSION);
  Serial.printf("backend=%s\n", API_BASE_URL);

  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_SOS_BUTTON, INPUT_PULLUP);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, LOW);

  analogReadResolution(12);

#if HAS_MQ135
  analogSetPinAttenuation(PIN_MQ135, ADC_11db);   // ~0-3.3 V input range
#endif
#if HAS_DHT22
  dht.begin();
#endif
#if HAS_MPU6050
  Wire.begin(PIN_IMU_SDA, PIN_IMU_SCL);
  imuReady = mpu.begin();
  if (imuReady) {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_10_HZ);
    Serial.println("[imu] MPU-6050 ready");
  } else {
    Serial.println("[imu] MPU-6050 NOT FOUND - accel fields omitted, fall detection off");
  }
#endif
#if HAS_BMP280
  bmpReady = bmp.begin(BMP280_ADDR);
  Serial.println(bmpReady ? "[bmp] BMP280 ready" : "[bmp] BMP280 NOT FOUND - pressure omitted");
#endif

  if (connectWifi()) {
    syncTime();
    sendHeartbeat();      // pulls current thresholds immediately
  }
  Serial.println("[minesafe] helmet ready");
}

void loop() {
  buzzerLoop();

  // ---- physical SOS button (active-low, debounced) ----
  if (digitalRead(PIN_SOS_BUTTON) == LOW && millis() - lastSosMs > SOS_DEBOUNCE_MS) {
    lastSosMs = millis();
    Serial.println("[sos] button pressed");
    sendSos();
  }

  // ---- WiFi with exponential backoff ----
  if (!connectWifi()) {
    delay(retryBackoffMs);
    retryBackoffMs = min(retryBackoffMs * 2, MAX_BACKOFF_MS);
    return;
  }

  // ---- periodic heartbeat / threshold sync ----
  if (millis() - lastHeartbeatMs > HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
  }

  // ---- periodic telemetry ----
  if (millis() - lastTelemetryMs < TELEMETRY_INTERVAL_MS) {
    delay(20);
    return;
  }

  // =========================== read sensors ==============================
  float gasRaw = NO_VALUE, tempC = NO_TEMP, hum = NO_VALUE, press = NO_VALUE;
  float ax = NO_AXIS, ay = NO_AXIS, az = NO_AXIS;

#if HAS_MQ135
  gasRaw = (float)analogRead(PIN_MQ135);
#endif
#if HAS_DHT22
  const float t = dht.readTemperature();
  const float h = dht.readHumidity();
  if (!isnan(t)) tempC = t;
  if (!isnan(h)) hum  = h;
  if (isnan(t) || isnan(h)) Serial.println("[dht] read failed - fields omitted this cycle");
#endif
#if HAS_BMP280
  if (bmpReady) press = bmp.readPressure() / 100.0f;   // Pa -> hPa
#endif
#if HAS_MPU6050
  if (imuReady) {
    sensors_event_t a, g, t;
    if (mpu.getEvent(&a, &g, &t)) {
      ax = a.acceleration.x / 9.81f;   // m/s^2 -> g
      ay = a.acceleration.y / 9.81f;
      az = a.acceleration.z / 9.81f;
    }
  }
#endif
  const float battery = readBatteryPercent();

  // ================== local safety rule (buzzer + LED) ===================
#if HAS_MPU6050
  const float mag = (ax != NO_AXIS) ? accelMagnitudeG(ax, ay, az) : NO_VALUE;
  const bool fall = (mag != NO_VALUE) ? detectFall(mag) : false;
#else
  const float mag = NO_VALUE;
  const bool fall = false;
#endif

  if ((gasRaw != NO_VALUE && gasRaw >= cfgGasCritical) ||
      (tempC != NO_TEMP && tempC >= cfgTempCritical) || fall) {
    Serial.printf("[alert] local: gas=%.0f/%.0f temp=%.1f/%.1f fall=%d |a|=%.2fg\n",
                  gasRaw, cfgGasCritical, tempC, cfgTempCritical, fall, mag);
    buzzerAlert(4000);
  }
  if (battery != NO_VALUE && battery <= cfgBatteryLow) {
    Serial.printf("[power] battery low: %.0f%% <= %.0f%%\n", battery, cfgBatteryLow);
  }

  // ========================= publish telemetry ===========================
  sendTelemetry(gasRaw, tempC, hum, press, ax, ay, az, battery);
}
