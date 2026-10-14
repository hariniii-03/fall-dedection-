/**
 * ============================================================================
 *  MineSafe AI — ESP32-S3 smart helmet  ·  OPTION A: HTTP transport
 * ============================================================================
 *  Copy this folder to your sketchbook and open minesafe_helmet_http.ino.
 *  Fill in the values marked <<< FILL >>> below, then upload.
 *
 *  Every value here has a matching variable on the backend (see .env.example).
 *  Keep DEVICE_API_KEY identical to DEVICE_API_KEY in the backend .env.
 * ============================================================================
 */

#ifndef MINESAFE_CONFIG_H
#define MINESAFE_CONFIG_H

// ------------------------------- identity --------------------------------
// <<< FILL >>> Must be unique per helmet. Sent as helmet_id / helmetCode.
#define HELMET_ID      "HELMET-001"
// <<< FILL >>> The worker wearing this helmet. Sent as worker_id / workerCode.
#define WORKER_ID      "WORKER-001"
#define FIRMWARE_VERSION "esp32-s3-1.0.0"

// --------------------------------- WiFi ----------------------------------
#define WIFI_SSID      ""      // <<< FILL >>> 2.4 GHz network only (no 5 GHz)
#define WIFI_PASSWORD  ""      // <<< FILL >>>
#define WIFI_TIMEOUT_MS 20000UL

// --------------------------- backend endpoint ----------------------------
// <<< FILL >>> Host running the MineSafe backend (no trailing slash).
//   Same PC as the backend:  http://192.168.1.50:3000   (use your LAN IP)
//   FastAPI backend instead:  http://192.168.1.50:8000   (same routes)
#define API_BASE_URL       "http://192.168.1.50:3000"

#define API_INGEST_PATH      "/api/ingest/sensor"
#define API_SOS_PATH         "/api/alerts/sos"
#define API_HEARTBEAT_PATH   "/api/helmets/%s/heartbeat"   // %s = HELMET_ID

// <<< FILL >>> Must equal DEVICE_API_KEY in the backend .env.
// Leave as "" only while developing with no key configured.
#define DEVICE_API_KEY     ""

// ------------------------------ timing -----------------------------------
#define TELEMETRY_INTERVAL_MS  2000UL   // sensor packet period
#define HEARTBEAT_INTERVAL_MS  15000UL  // heartbeat + threshold sync period
#define RETRY_BACKOFF_MS       3000UL   // first retry delay after a network error
#define MAX_BACKOFF_MS         60000UL  // exponential backoff cap
#define HTTP_TIMEOUT_MS        8000
#define FALL_DEBOUNCE_MS       5000UL   // local fall-alert debounce
#define SOS_DEBOUNCE_MS        3000UL

// ------------------------------ sensors ----------------------------------
// Set a HAS_* flag to 0 for any sensor that is NOT fitted. The firmware then
// omits that field from the payload, so the backend and the app show it as
// "unavailable" instead of mistaking "missing" for "zero" or "safe".
// NOTE: at least ONE sensor must be enabled, otherwise there is nothing to send.
#define HAS_MQ135            1   // air quality (analog)
#define HAS_DHT22            1   // temperature + humidity
#define HAS_MPU6050          1   // accelerometer -> fall detection
#define HAS_BMP280           0   // OPTIONAL atmospheric pressure
#define HAS_BATTERY_DIVIDER  1   // battery voltage divider

// --------------------------- alert thresholds ----------------------------
// Local firmware fallbacks only. Every heartbeat response carries fresh values
// from the backend (Settings screen), so safety limits are centrally
// configurable without reflashing.
#define TH_GAS_WARNING       900.0f   // MQ-135 raw ADC counts — NOT ppm / AQI
#define TH_GAS_CRITICAL     1400.0f
#define TH_TEMP_WARNING       38.0f
#define TH_TEMP_CRITICAL      43.0f
#define TH_BATTERY_LOW        25.0f
#define TH_FALL_IMPACT_G       2.6f
#define TH_FALL_FREEFALL_G     0.45f
#define FALL_WINDOW_MS       1200UL   // max gap between free-fall and impact

// ------------------------------- pin map ---------------------------------
#define PIN_MQ135        4    // ADC1_CH3, MQ-135 analog out (AO)
#define PIN_DHT          5    // DHT22 data
#define PIN_BATTERY      6    // 2:1 resistor divider from battery +
#define PIN_BUZZER       7    // active buzzer (through a transistor)
#define PIN_LED          8    // alarm LED
#define PIN_SOS_BUTTON   9    // SOS push button to GND (uses internal pull-up)
#define PIN_IMU_SDA     41    // MPU-6050 / BMP280 I2C SDA
#define PIN_IMU_SCL     42    // MPU-6050 / BMP280 I2C SCL
#define BMP280_ADDR   0x76

#endif // MINESAFE_CONFIG_H
