#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MineSafe AI — Option A (HTTP) verification script
#
# Simulates exactly what the ESP32-S3 posts, so you can confirm the backend
# accepts Option A payloads BEFORE wiring any hardware.
#
#   cd esp32-firmware/http && ./verify.sh
#   BASE_URL=http://192.168.1.50:3000 DEVICE_API_KEY=secret ./verify.sh
# ---------------------------------------------------------------------------
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
HELMET="${HELMET_ID:-HELMET-001}"
WORKER="${WORKER_ID:-WORKER-001}"
# The firmware ALWAYS sends the x-device-key header (empty when unconfigured),
# so the script does the same. Set DEVICE_API_KEY to match the backend .env.
AUTH=(-H "x-device-key: ${DEVICE_API_KEY:-minesafe-dev}")

pass=0; fail=0
check() { # check <expected> <actual> <label>
  if [ "$1" = "$2" ]; then echo "  PASS  $3"; pass=$((pass+1));
  else echo "  FAIL  $3 (expected $1, got $2)"; fail=$((fail+1)); fi
}

echo "MineSafe AI · Option A verification"
echo "backend: $BASE_URL   helmet: $HELMET"
echo

# 1. health -----------------------------------------------------------------
echo "1) Backend health"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/health")
check 200 "$code" "GET /api/health -> 200"

# 2. valid telemetry packet (the real firmware payload) ---------------------
echo "2) Valid telemetry packet (normal values)"
code=$(curl -s -o /tmp/ms_verify.json -w '%{http_code}' -X POST "$BASE_URL/api/ingest/sensor" \
  -H 'content-type: application/json' "${AUTH[@]+"${AUTH[@]}"}" \
  -d "{\"helmet_id\":\"$HELMET\",\"worker_id\":\"$WORKER\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"gas_raw\":640,\"temperature_c\":31.5,\"humidity_percent\":62,\"accel_x\":0.12,\"accel_y\":0.18,\"accel_z\":0.98,\"battery_percent\":82,\"source\":\"device\"}")
check 201 "$code" "POST /api/ingest/sensor -> 201"
grep -q '"accepted":true' /tmp/ms_verify.json && echo "  PASS  response accepted:true" && pass=$((pass+1))

# 3. gas critical -> buzzerCommand ON --------------------------------------
echo "3) Gas critical threshold"
body=$(curl -s -X POST "$BASE_URL/api/ingest/sensor" \
  -H 'content-type: application/json' "${AUTH[@]+"${AUTH[@]}"}" \
  -d "{\"helmet_id\":\"$HELMET\",\"worker_id\":\"$WORKER\",\"gas_raw\":1800,\"temperature_c\":32,\"accel_x\":0.1,\"accel_y\":0.1,\"accel_z\":0.99,\"battery_percent\":80,\"source\":\"device\"}")
echo "$body" | grep -q '"buzzerCommand":"ON"' && echo "  PASS  buzzerCommand:ON" && pass=$((pass+1)) \
  || { echo "  FAIL  buzzerCommand not ON: $body"; fail=$((fail+1)); }
echo "$body" | grep -q 'GAS_CRITICAL' && echo "  PASS  GAS_CRITICAL alert raised" && pass=$((pass+1))

# 4. missing timestamp must still be accepted -------------------------------
echo "4) Packet without timestamp (NTP not yet synced)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/ingest/sensor" \
  -H 'content-type: application/json' "${AUTH[@]+"${AUTH[@]}"}" \
  -d "{\"helmet_id\":\"$HELMET\",\"worker_id\":\"$WORKER\",\"gas_raw\":660,\"temperature_c\":31,\"accel_x\":0.1,\"accel_y\":0.1,\"accel_z\":0.99,\"battery_percent\":81,\"source\":\"device\"}")
check 201 "$code" "ingest without timestamp -> 201 (not 422)"

# 5. malformed payload rejected --------------------------------------------
echo "5) Malformed payloads are rejected"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/ingest/sensor" \
  -H 'content-type: application/json' "${AUTH[@]+"${AUTH[@]}"}" \
  -d "{\"helmet_id\":\"$HELMET\",\"gas_raw\":99999,\"source\":\"device\"}")
check 422 "$code" "gas_raw out of range -> 422"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/ingest/sensor" \
  -H 'content-type: application/json' "${AUTH[@]+"${AUTH[@]}"}" \
  -d "{\"helmet_id\":\"$HELMET\",\"source\":\"device\"}")
check 422 "$code" "no sensor field -> 422"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/ingest/sensor" \
  -H 'content-type: application/json' "${AUTH[@]+"${AUTH[@]}"}" \
  -d '{"helmet_id":"HELMET-001","timestamp":"12345","gas_raw":600,"source":"device"}')
check 422 "$code" "non-ISO timestamp -> 422 (this is why firmware omits it)"

# 6. heartbeat returns thresholds for the helmet ----------------------------
echo "6) Heartbeat + threshold sync"
body=$(curl -s -X POST "$BASE_URL/api/helmets/$HELMET/heartbeat" \
  -H 'content-type: application/json' "${AUTH[@]+"${AUTH[@]}"}" \
  -d '{"battery_percent":81,"firmware_version":"esp32-s3-1.0.0","rssi":-58}')
echo "$body" | grep -q '"config"' && echo "  PASS  heartbeat returns config block" && pass=$((pass+1)) \
  || { echo "  FAIL  no config block: $body"; fail=$((fail+1)); }

# 7. device-authenticated SOS ----------------------------------------------
echo "7) Helmet SOS (device key, no user session)"
code=$(curl -s -o /tmp/ms_sos.json -w '%{http_code}' -X POST "$BASE_URL/api/alerts/sos" \
  -H 'content-type: application/json' "${AUTH[@]+"${AUTH[@]}"}" \
  -d "{\"helmetCode\":\"$HELMET\",\"workerCode\":\"$WORKER\",\"note\":\"verify.sh hardware SOS test\",\"source\":\"device\"}")
check 201 "$code" "POST /api/alerts/sos (x-device-key) -> 201"
grep -q '"severity":"critical"' /tmp/ms_sos.json && echo "  PASS  SOS alert is critical" && pass=$((pass+1))

echo
echo "----------------------------------------"
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ] && echo "Option A transport is working. Flash minesafe_helmet_http.ino next." || echo "Fix the failures above before flashing hardware."
exit "$fail"
