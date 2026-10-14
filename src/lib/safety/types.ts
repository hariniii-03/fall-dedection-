/**
 * Safety configuration types, defaults and validation.
 *
 * IMPORTANT: `gasWarning` / `gasCritical` operate on the MQ-135 RAW analog
 * reading (ADC counts) unless a calibrated conversion has been implemented in
 * firmware. A raw MQ-135 value is NOT an AQI and NOT a ppm concentration.
 */

export type SafetyThresholds = {
  gasWarning: number;
  gasCritical: number;
  gasUnit: string;
  temperatureWarning: number;
  temperatureCritical: number;
  humidityWarning: number;
  batteryLow: number;
  offlineTimeoutSeconds: number;
  fallImpactG: number;
  fallFreeFallG: number;
  fallWindowMs: number;
  anomalyEnabled: boolean;
  anomalySensitivity: number;
  anomalyWindow: number;
  alertCooldownSeconds: number;
};

export const DEFAULT_THRESHOLDS: SafetyThresholds = {
  gasWarning: 900,
  gasCritical: 1400,
  gasUnit: "MQ-135 raw ADC",
  temperatureWarning: 38,
  temperatureCritical: 43,
  humidityWarning: 85,
  batteryLow: 25,
  offlineTimeoutSeconds: 90,
  fallImpactG: 2.6,
  fallFreeFallG: 0.45,
  fallWindowMs: 1200,
  anomalyEnabled: true,
  anomalySensitivity: 3,
  anomalyWindow: 40,
  alertCooldownSeconds: 120,
};

export type Severity = "info" | "warning" | "critical";

export type HelmetSensorSample = {
  gasRaw?: number | null;
  temperatureC?: number | null;
  humidityPercent?: number | null;
  pressureHpa?: number | null;
  accelX?: number | null;
  accelY?: number | null;
  accelZ?: number | null;
  accelMagnitudeG?: number | null;
  batteryPercent?: number | null;
  sensors?: {
    gas?: boolean;
    temperature?: boolean;
    humidity?: boolean;
    accelerometer?: boolean;
    pressure?: boolean;
    battery?: boolean;
  };
};

export type DetectionCandidate = {
  /** stable key used for duplicate-alert prevention, e.g. `gas:HELMET-001:critical` */
  dedupeKey: string;
  type:
    | "gas"
    | "fall"
    | "temperature"
    | "humidity"
    | "battery"
    | "offline"
    | "sos"
    | "anomaly";
  severity: Severity;
  title: string;
  message: string;
  explanation: string;
  ruleId: string;
  detector: "rule" | "anomaly" | "manual";
  measuredValue: number | null;
  threshold: number | null;
  unit: string | null;
};

export function magnitudeG(x?: number | null, y?: number | null, z?: number | null): number | null {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof z !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }
  return Math.sqrt(x * x + y * y + z * z);
}

export type ValidationIssue = { path: string; message: string };

/**
 * Validate threshold settings before persisting them. Ranges are intentionally
 * strict so an operator cannot disable safety monitoring by typo.
 */
export function validateThresholds(input: Partial<SafetyThresholds>): {
  ok: boolean;
  issues: ValidationIssue[];
  value: SafetyThresholds;
} {
  const issues: ValidationIssue[] = [];
  const merged: SafetyThresholds = { ...DEFAULT_THRESHOLDS, ...input };

  const numberRange = (
    key: keyof SafetyThresholds,
    min: number,
    max: number,
    unit?: string,
  ) => {
    const raw = merged[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      issues.push({ path: key, message: "must be a finite number" });
      return;
    }
    if (raw < min || raw > max) {
      issues.push({
        path: key,
        message: `must be between ${min} and ${max}${unit ? ` ${unit}` : ""}`,
      });
    }
  };

  numberRange("gasWarning", 50, 5000, "raw ADC counts");
  numberRange("gasCritical", 100, 6000, "raw ADC counts");
  numberRange("temperatureWarning", 20, 80, "°C");
  numberRange("temperatureCritical", 25, 120, "°C");
  numberRange("humidityWarning", 40, 100, "%");
  numberRange("batteryLow", 5, 60, "%");
  numberRange("offlineTimeoutSeconds", 15, 3600, "s");
  numberRange("fallImpactG", 1.2, 8, "g");
  numberRange("fallFreeFallG", 0.05, 1, "g");
  numberRange("fallWindowMs", 200, 5000, "ms");
  numberRange("anomalySensitivity", 1.5, 6, "sigma");
  numberRange("anomalyWindow", 10, 500, "samples");
  numberRange("alertCooldownSeconds", 0, 3600, "s");

  if (merged.gasCritical <= merged.gasWarning) {
    issues.push({ path: "gasCritical", message: "critical must be greater than warning" });
  }
  if (merged.temperatureCritical <= merged.temperatureWarning) {
    issues.push({ path: "temperatureCritical", message: "critical must be greater than warning" });
  }
  if (merged.fallFreeFallG >= merged.fallImpactG) {
    issues.push({ path: "fallFreeFallG", message: "free-fall threshold must be below impact threshold" });
  }
  if (typeof merged.anomalyEnabled !== "boolean") {
    issues.push({ path: "anomalyEnabled", message: "must be true or false" });
  }

  return { ok: issues.length === 0, issues, value: merged };
}
