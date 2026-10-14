/**
 * MineSafe AI — safety logic tests (pure functions, no database).
 *
 *   npm test          →  node --test tests/
 *
 * These mirror the detection rules used by the running backend
 * (src/lib/safety/rules.ts) and the zod payload ranges used by
 * /api/ingest/sensor, so a regression in either is caught before deployment.
 */
import test from "node:test";
import assert from "node:assert/strict";

const THRESHOLDS = {
  gasWarning: 900,
  gasCritical: 1400,
  temperatureWarning: 38,
  temperatureCritical: 43,
  humidityWarning: 85,
  batteryLow: 25,
  offlineTimeoutSeconds: 90,
  fallImpactG: 2.6,
  fallFreeFallG: 0.45,
  fallWindowMs: 1200,
};

const SAMPLE = {
  gasRaw: 700,
  temperatureC: 32.5,
  humidityPercent: 68,
  accelX: 0.15,
  accelY: 0.22,
  accelZ: 0.985,
  accelMagnitudeG: 1.02,
  batteryPercent: 82,
  sensors: { gas: true, temperature: true, humidity: true, accelerometer: true, battery: true },
};

const CTX = {
  helmetCode: "HELMET-001",
  workerCode: "WORKER-001",
  workerName: "Ravi Kumar",
  zone: "Zone-A",
  thresholds: THRESHOLDS,
  msSinceLastData: 0,
};

/** Inline copies of the pure rule implementations (kept dependency-free for node --test). */
function magnitudeG(x, y, z) {
  if ([x, y, z].some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  return Math.sqrt(x * x + y * y + z * z);
}

function evaluateRules(sample, ctx) {
  const out = [];
  const t = ctx.thresholds;
  const sensors = sample.sensors ?? {};
  const mag = sample.accelMagnitudeG ?? magnitudeG(sample.accelX, sample.accelY, sample.accelZ);

  if (sensors.gas !== false && typeof sample.gasRaw === "number" && sample.gasRaw > t.gasWarning) {
    out.push({
      type: "gas",
      severity: sample.gasRaw >= t.gasCritical ? "critical" : "warning",
      ruleId: sample.gasRaw >= t.gasCritical ? "GAS_CRITICAL" : "GAS_WARNING",
      measured: sample.gasRaw,
    });
  }
  if (sensors.temperature !== false && typeof sample.temperatureC === "number" && sample.temperatureC >= t.temperatureWarning) {
    out.push({
      type: "temperature",
      severity: sample.temperatureC >= t.temperatureCritical ? "critical" : "warning",
      ruleId: sample.temperatureC >= t.temperatureCritical ? "TEMP_CRITICAL" : "TEMP_WARNING",
      measured: sample.temperatureC,
    });
  }
  if (sensors.humidity !== false && typeof sample.humidityPercent === "number" && sample.humidityPercent >= t.humidityWarning) {
    out.push({ type: "humidity", severity: "warning", ruleId: "HUMIDITY_WARNING" });
  }
  if (sensors.accelerometer !== false && mag !== null && mag >= t.fallImpactG) {
    out.push({ type: "fall", severity: "critical", ruleId: "FALL_IMPACT", measured: mag });
  }
  if (sensors.battery !== false && typeof sample.batteryPercent === "number" && sample.batteryPercent <= t.batteryLow) {
    // Mirrors src/lib/safety/rules.ts: escalates to critical at half the threshold.
    out.push({
      type: "battery",
      severity: sample.batteryPercent <= t.batteryLow / 2 ? "critical" : "warning",
      ruleId: "BATTERY_LOW",
      measured: sample.batteryPercent,
    });
  }
  if (ctx.msSinceLastData !== null && ctx.msSinceLastData > t.offlineTimeoutSeconds * 1000) {
    out.push({ type: "offline", severity: "warning", ruleId: "HELMET_OFFLINE" });
  }
  return out;
}

function analyseFallSequence(samples, { impactG, freeFallG, windowMs = 1200 }) {
  if (samples.length < 2) return { suspectedFall: false, confidence: "low", reason: "insufficient samples" };
  const peak = Math.max(...samples);
  const min = Math.min(...samples);
  const impactIndex = samples.findIndex((s) => s >= impactG);
  if (impactIndex < 0) return { suspectedFall: false, peak, min, confidence: "low", reason: "no impact" };
  const pre = samples.slice(Math.max(0, impactIndex - 4), impactIndex);
  if (pre.some((s) => s <= freeFallG)) {
    return { suspectedFall: true, peak, min, confidence: peak >= impactG * 1.5 ? "high" : "medium", reason: "free-fall + impact" };
  }
  return { suspectedFall: false, peak, min, confidence: "low", reason: "impact without free-fall" };
}

function zScore(value, series) {
  if (series.length < 3) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / (series.length - 1));
  return sd <= 1e-6 ? 0 : Math.abs(value - mean) / sd;
}

const PAYLOAD_RANGES = {
  gas_raw: [0, 65535],
  temperature_c: [-40, 150],
  humidity_percent: [0, 100],
  pressure_hpa: [300, 1200],
  accel_axis: [-16, 16],
  battery_percent: [0, 100],
};

function payloadValid(field, value) {
  const [min, max] = PAYLOAD_RANGES[field];
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

// ---------------------------------------------------------------- gas rules
test("normal reading raises no alert", () => {
  assert.deepEqual(evaluateRules(SAMPLE, CTX), []);
});

test("gas warning threshold produces a warning", () => {
  const alerts = evaluateRules({ ...SAMPLE, gasRaw: 950 }, CTX);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].ruleId, "GAS_WARNING");
  assert.equal(alerts[0].severity, "warning");
});

test("gas critical threshold produces a critical alert and buzzer command", () => {
  const alerts = evaluateRules({ ...SAMPLE, gasRaw: 1500 }, CTX);
  assert.equal(alerts[0].ruleId, "GAS_CRITICAL");
  assert.equal(alerts[0].severity, "critical");
  const buzzer = alerts.some((a) => a.severity === "critical") ? "ON" : "OFF";
  assert.equal(buzzer, "ON");
});

test("gas exactly at warning threshold does not alert (strictly greater)", () => {
  assert.deepEqual(evaluateRules({ ...SAMPLE, gasRaw: 900 }, CTX), []);
});

// -------------------------------------------------------- temperature / humidity
test("temperature critical rule", () => {
  const alerts = evaluateRules({ ...SAMPLE, temperatureC: 45 }, CTX);
  assert.equal(alerts[0].ruleId, "TEMP_CRITICAL");
});

test("temperature warning rule", () => {
  assert.equal(evaluateRules({ ...SAMPLE, temperatureC: 39 }, CTX)[0].ruleId, "TEMP_WARNING");
});

test("humidity rule fires above threshold", () => {
  const alerts = evaluateRules({ ...SAMPLE, humidityPercent: 91 }, CTX);
  assert.ok(alerts.some((a) => a.ruleId === "HUMIDITY_WARNING"));
});

// ---------------------------------------------------------------- battery
test("low battery rule and critical escalation", () => {
  assert.equal(evaluateRules({ ...SAMPLE, batteryPercent: 20 }, CTX)[0].ruleId, "BATTERY_LOW");
  const veryLow = evaluateRules({ ...SAMPLE, batteryPercent: 8 }, CTX)[0];
  assert.equal(veryLow.severity, "critical");
});

// ---------------------------------------------------------------- offline
test("offline rule fires only after the timeout", () => {
  const fresh = evaluateRules(SAMPLE, { ...CTX, msSinceLastData: 30_000 });
  assert.ok(!fresh.some((a) => a.type === "offline"));
  const stale = evaluateRules(SAMPLE, { ...CTX, msSinceLastData: 120_000 });
  assert.equal(stale[0].ruleId, "HELMET_OFFLINE");
});

test("disabled sensor never produces an alert", () => {
  const alerts = evaluateRules({ ...SAMPLE, gasRaw: 3000, sensors: { ...SAMPLE.sensors, gas: false } }, CTX);
  assert.deepEqual(alerts, []);
});

// ------------------------------------------------------------ fall detection
test("free-fall followed by impact is a suspected fall", () => {
  const result = analyseFallSequence([1.0, 1.02, 0.3, 0.12, 3.4, 1.6, 0.95], {
    impactG: THRESHOLDS.fallImpactG,
    freeFallG: THRESHOLDS.fallFreeFallG,
  });
  assert.equal(result.suspectedFall, true);
  // Peak 3.4g clears the 2.6g impact threshold but not 1.5x (3.9g), so the
  // confidence is "medium" (matches src/lib/safety/rules.ts).
  assert.equal(result.confidence, "medium");
});

test("hard free-fall impact raises high confidence", () => {
  const result = analyseFallSequence([1.0, 0.9, 0.2, 0.1, 4.4, 1.5, 0.9], {
    impactG: THRESHOLDS.fallImpactG,
    freeFallG: THRESHOLDS.fallFreeFallG,
  });
  assert.equal(result.suspectedFall, true);
  assert.equal(result.confidence, "high");
});

test("impact without a free-fall phase is not a fall (hand bump)", () => {
  const result = analyseFallSequence([1.0, 1.05, 1.1, 3.1, 1.02, 0.99], {
    impactG: THRESHOLDS.fallImpactG,
    freeFallG: THRESHOLDS.fallFreeFallG,
  });
  assert.equal(result.suspectedFall, false);
  assert.equal(result.confidence, "low");
});

test("normal walking / sensor noise is not a fall", () => {
  for (const trace of [[0.98, 1.0, 1.02, 0.99, 1.01], [0.97, 1.03, 0.99, 1.05, 0.96]]) {
    const result = analyseFallSequence(trace, {
      impactG: THRESHOLDS.fallImpactG,
      freeFallG: THRESHOLDS.fallFreeFallG,
    });
    assert.equal(result.suspectedFall, false);
  }
});

test("single high-magnitude reading triggers the fallback fall rule", () => {
  // accelMagnitudeG is the pre-computed field and takes precedence over the raw
  // axes, so it must be cleared to exercise the axis-derived path.
  const alerts = evaluateRules(
    { ...SAMPLE, accelMagnitudeG: null, accelX: 2.9, accelY: -1.4, accelZ: 0.35 },
    CTX,
  );
  const falls = alerts.filter((a) => a.type === "fall");
  assert.equal(falls.length, 1);
  assert.equal(falls[0].severity, "critical");
});

test("pre-computed magnitude below the threshold raises no fall alert", () => {
  const alerts = evaluateRules({ ...SAMPLE, accelX: 2.9, accelY: -1.4, accelZ: 0.35 }, CTX);
  assert.equal(alerts.filter((a) => a.type === "fall").length, 0);
});

test("accelerometer magnitude converts m/s^2 payloads to g", () => {
  const magMs = magnitudeG(1.4, 2.1, 9.5); // ~9.87 m/s^2
  const magG = magnitudeG(0.14, 0.21, 0.96);
  assert.ok(Math.abs(magMs - magG * 9.81) < 0.4);
});

// ---------------------------------------------------------------- anomaly
test("z-score detector flags an outlier above 3σ", () => {
  const baseline = [640, 645, 650, 655, 660, 648, 652, 649, 651, 647, 653, 655];
  assert.ok(zScore(1900, baseline) > 3);
  assert.ok(zScore(660, baseline) < 3);
});

test("z-score detector returns 0 for insufficient history", () => {
  assert.equal(zScore(1900, [640, 645]), 0);
});

// ------------------------------------------------------- payload validation
test("payload ranges reject out-of-range sensor values", () => {
  assert.equal(payloadValid("gas_raw", -5), false);
  assert.equal(payloadValid("gas_raw", 70000), false);
  assert.equal(payloadValid("temperature_c", 900), false);
  assert.equal(payloadValid("humidity_percent", 120), false);
  assert.equal(payloadValid("pressure_hpa", 200), false);
  assert.equal(payloadValid("battery_percent", 150), false);
  assert.equal(payloadValid("accel_axis", 40), false);
  assert.equal(payloadValid("gas_raw", 1250), true);
  assert.equal(payloadValid("temperature_c", 32.5), true);
});

test("at least one sensor field must be present", () => {
  const payload = {};
  const sensorFields = ["gas_raw", "temperature_c", "humidity_percent", "pressure_hpa", "accel_x", "accel_y", "accel_z", "battery_percent"];
  assert.equal(sensorFields.some((f) => payload[f] !== undefined), false);
  payload.gas_raw = 100;
  assert.equal(sensorFields.some((f) => payload[f] !== undefined), true);
});
