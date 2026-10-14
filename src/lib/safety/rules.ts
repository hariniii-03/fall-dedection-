/**
 * Rule-based hazard detection (deterministic, explainable).
 *
 * This module is intentionally PURE (no DB / no network) so it can be unit
 * tested with recorded accelerometer sequences. AI-based anomaly detection
 * lives in `anomaly.ts` and is always reported separately from these rules.
 */
import {
  type DetectionCandidate,
  type HelmetSensorSample,
  type SafetyThresholds,
  type Severity,
  magnitudeG,
} from "./types";

export type RuleContext = {
  helmetCode: string;
  workerCode?: string | null;
  workerName?: string | null;
  zone?: string | null;
  thresholds: SafetyThresholds;
  /** ms since the helmet last delivered data (used by the offline rule) */
  msSinceLastData: number | null;
  previousSeverity?: Partial<Record<string, Severity>>;
};

export type FallAnalysisInput = {
  /** recent |accel| samples in g, oldest first, with ms offsets */
  samples: { magnitudeG: number; offsetMs: number }[];
  impactG: number;
  freeFallG: number;
  windowMs: number;
};

export type FallAnalysisResult = {
  suspectedFall: boolean;
  peakG: number | null;
  minG: number | null;
  reason: string;
  confidence: "low" | "medium" | "high";
};

/**
 * Fall heuristic: a suspected fall requires BOTH a free-fall / low-g phase and
 * a subsequent impact spike inside the configured window, or an isolated very
 * strong impact followed by a large orientation change.
 *
 * This is a transparent rule, not a trained model. Validate against real
 * helmet recordings before trusting it in production.
 */
export function analyseFallSequence(input: FallAnalysisInput): FallAnalysisResult {
  const { samples, impactG, freeFallG, windowMs } = input;
  if (samples.length < 2) {
    return {
      suspectedFall: false,
      peakG: samples[0]?.magnitudeG ?? null,
      minG: samples[0]?.magnitudeG ?? null,
      reason: "Not enough accelerometer samples to evaluate (need at least 2).",
      confidence: "low",
    };
  }

  const peak = Math.max(...samples.map((s) => s.magnitudeG));
  const min = Math.min(...samples.map((s) => s.magnitudeG));

  const impactIndex = samples.findIndex((s) => s.magnitudeG >= impactG);
  if (impactIndex < 0) {
    return {
      suspectedFall: false,
      peakG: peak,
      minG: min,
      reason: `Peak |accel| ${peak.toFixed(2)}g stayed below the impact threshold ${impactG}g.`,
      confidence: "low",
    };
  }

  const impact = samples[impactIndex];
  const windowStart = impact.offsetMs - windowMs;
  const preImpact = samples.filter(
    (s) => s.offsetMs >= windowStart && s.offsetMs < impact.offsetMs,
  );

  const hadFreeFall = preImpact.some((s) => s.magnitudeG <= freeFallG);
  const postImpact = samples.slice(impactIndex + 1);
  const orientationShift = postImpact.some((s) => s.magnitudeG < freeFallG * 1.6);

  if (hadFreeFall) {
    return {
      suspectedFall: true,
      peakG: peak,
      minG: min,
      reason: `Free-fall phase detected (min ${min.toFixed(2)}g <= ${freeFallG}g) followed by an impact of ${impact.magnitudeG.toFixed(2)}g >= ${impactG}g within ${windowMs}ms.`,
      confidence: peak >= impactG * 1.5 ? "high" : "medium",
    };
  }

  if (impact.magnitudeG >= impactG * 1.4 && (orientationShift || preImpact.length === 0)) {
    return {
      suspectedFall: true,
      peakG: peak,
      minG: min,
      reason: `Isolated impact of ${impact.magnitudeG.toFixed(2)}g (>= ${(impactG * 1.4).toFixed(2)}g) with post-impact orientation change.`,
      confidence: "medium",
    };
  }

  return {
    suspectedFall: false,
    peakG: peak,
    minG: min,
    reason: `Impact of ${impact.magnitudeG.toFixed(2)}g detected but no preceding free-fall phase within ${windowMs}ms.`,
    confidence: "low",
  };
}

function label(code: string | null | undefined, name: string | null | undefined): string {
  if (code && name) return `${code} (${name})`;
  return code ?? name ?? "unknown worker";
}

/** Evaluate all deterministic safety rules against one helmet sample. */
export function evaluateRules(sample: HelmetSensorSample, ctx: RuleContext): DetectionCandidate[] {
  const out: DetectionCandidate[] = [];
  const who = label(ctx.workerCode, ctx.workerName);
  const t = ctx.thresholds;
  const sensors = sample.sensors ?? {};

  // ---------------- Air quality / gas (MQ-135 raw) ----------------
  if (sensors.gas !== false && typeof sample.gasRaw === "number" && sample.gasRaw > t.gasWarning) {
    const severity: Severity = sample.gasRaw >= t.gasCritical ? "critical" : "warning";
    out.push({
      dedupeKey: `gas:${ctx.helmetCode}:${severity}`,
      type: "gas",
      severity,
      title: severity === "critical" ? "Hazardous air quality" : "Air quality warning",
      message:
        severity === "critical"
          ? `CRITICAL: Hazardous air-quality reading detected for Worker ${who}. Check the worker's location and initiate the appropriate safety procedure.`
          : `WARNING: Air-quality reading for Worker ${who} is above the warning threshold. Improve ventilation and keep monitoring.`,
      explanation: `MQ-135 raw reading ${sample.gasRaw.toFixed(0)} exceeded the ${severity} threshold ${t.gasCritical.toFixed(0)} (${t.gasUnit}). Raw MQ-135 output is an air-quality indicator only, not a calibrated gas concentration.`,
      ruleId: severity === "critical" ? "GAS_CRITICAL" : "GAS_WARNING",
      detector: "rule",
      measuredValue: sample.gasRaw,
      threshold: severity === "critical" ? t.gasCritical : t.gasWarning,
      unit: "raw",
    });
  }

  // ---------------- Temperature ----------------
  if (
    sensors.temperature !== false &&
    typeof sample.temperatureC === "number" &&
    sample.temperatureC >= t.temperatureWarning
  ) {
    const severity: Severity =
      sample.temperatureC >= t.temperatureCritical ? "critical" : "warning";
    out.push({
      dedupeKey: `temperature:${ctx.helmetCode}:${severity}`,
      type: "temperature",
      severity,
      title: severity === "critical" ? "Critical helmet temperature" : "High temperature",
      message:
        severity === "critical"
          ? `CRITICAL: Temperature ${sample.temperatureC.toFixed(1)}°C recorded for Worker ${who}. Move the worker to a cooler area and check for heat stress.`
          : `WARNING: Temperature ${sample.temperatureC.toFixed(1)}°C recorded for Worker ${who}. Provide ventilation and hydration.`,
      explanation: `Temperature ${sample.temperatureC.toFixed(1)}°C crossed the ${severity} threshold ${severity === "critical" ? t.temperatureCritical : t.temperatureWarning}°C.`,
      ruleId: severity === "critical" ? "TEMP_CRITICAL" : "TEMP_WARNING",
      detector: "rule",
      measuredValue: sample.temperatureC,
      threshold: severity === "critical" ? t.temperatureCritical : t.temperatureWarning,
      unit: "°C",
    });
  }

  // ---------------- Humidity (supporting reading) ----------------
  if (
    sensors.humidity !== false &&
    typeof sample.humidityPercent === "number" &&
    sample.humidityPercent >= t.humidityWarning
  ) {
    out.push({
      dedupeKey: `humidity:${ctx.helmetCode}`,
      type: "humidity",
      severity: "warning",
      title: "Very high humidity",
      message: `WARNING: Humidity ${sample.humidityPercent.toFixed(0)}% for Worker ${who}. High humidity increases heat-stress risk.`,
      explanation: `Humidity ${sample.humidityPercent.toFixed(0)}% >= configured ${t.humidityWarning}%.`,
      ruleId: "HUMIDITY_WARNING",
      detector: "rule",
      measuredValue: sample.humidityPercent,
      threshold: t.humidityWarning,
      unit: "%",
    });
  }

  // ---------------- Fall detection ----------------
  if (sensors.accelerometer !== false) {
    const mag =
      sample.accelMagnitudeG ??
      magnitudeG(sample.accelX, sample.accelY, sample.accelZ);
    if (mag !== null && mag >= t.fallImpactG) {
      out.push({
        dedupeKey: `fall:${ctx.helmetCode}`,
        type: "fall",
        severity: "critical",
        title: "Suspected fall detected",
        message: `EMERGENCY: A possible fall was detected for Worker ${who}. Verify the worker's condition immediately.`,
        explanation: `Helmet |accel| reached ${mag.toFixed(2)}g which is at or above the configured impact threshold ${t.fallImpactG}g. Confirm with the accelerometer trace before dispatching rescue.`,
        ruleId: "FALL_IMPACT",
        detector: "rule",
        measuredValue: mag,
        threshold: t.fallImpactG,
        unit: "g",
      });
    }
  }

  // ---------------- Low battery ----------------
  if (sensors.battery !== false && typeof sample.batteryPercent === "number") {
    if (sample.batteryPercent <= t.batteryLow) {
      out.push({
        dedupeKey: `battery:${ctx.helmetCode}`,
        type: "battery",
        severity: sample.batteryPercent <= t.batteryLow / 2 ? "critical" : "warning",
        title: "Helmet battery low",
        message: `WARNING: Helmet ${ctx.helmetCode} battery is at ${sample.batteryPercent.toFixed(0)}% (threshold ${t.batteryLow.toFixed(0)}%). Replace or recharge before the next shift.`,
        explanation: `Battery ${sample.batteryPercent.toFixed(0)}% <= configured ${t.batteryLow}%.`,
        ruleId: "BATTERY_LOW",
        detector: "rule",
        measuredValue: sample.batteryPercent,
        threshold: t.batteryLow,
        unit: "%",
      });
    }
  }

  // ---------------- Helmet offline ----------------
  if (ctx.msSinceLastData !== null && ctx.msSinceLastData > t.offlineTimeoutSeconds * 1000) {
    out.push({
      dedupeKey: `offline:${ctx.helmetCode}`,
      type: "offline",
      severity: "warning",
      title: "Helmet offline",
      message: `WARNING: Helmet ${ctx.helmetCode} has not transmitted for ${Math.round(ctx.msSinceLastData / 1000)}s (timeout ${t.offlineTimeoutSeconds}s). Missing data is treated as UNKNOWN, not as safe.`,
      explanation: `No telemetry for ${Math.round(ctx.msSinceLastData / 1000)}s which exceeds the configured offline timeout of ${t.offlineTimeoutSeconds}s.`,
      ruleId: "HELMET_OFFLINE",
      detector: "rule",
      measuredValue: Math.round(ctx.msSinceLastData / 1000),
      threshold: t.offlineTimeoutSeconds,
      unit: "s",
    });
  }

  return out;
}

/** Severity ranking helper used for notifications and dashboards. */
export function severityRank(severity: Severity): number {
  return severity === "critical" ? 3 : severity === "warning" ? 2 : 1;
}
