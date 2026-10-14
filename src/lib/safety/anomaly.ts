/**
 * AI / statistical anomaly detection layer.
 *
 * Design goals:
 *  - modular: any detector implements `AnomalyDetector`
 *  - explainable: every result carries a human-readable `reason`
 *  - honest: this prototype ships a transparent rolling z-score detector, NOT a
 *    trained model. No accuracy claims are made until it is evaluated on real
 *    helmet data (see docs/AI_ANALYSIS.md).
 */
import type { HelmetSensorSample } from "./types";

export type AnomalyFeature =
  | "gasRaw"
  | "temperatureC"
  | "humidityPercent"
  | "accelMagnitudeG";

export type AnomalyResult = {
  score: number; // 0..1 normalised anomaly strength (0 = normal)
  maxSigma: number;
  feature: AnomalyFeature | null;
  value: number | null;
  baselineMean: number | null;
  baselineStdDev: number | null;
  label: "normal" | "watch" | "anomalous" | "insufficient_history";
  reason: string;
  detector: string;
};

export interface AnomalyDetector {
  readonly name: string;
  detect(sample: HelmetSensorSample, history: number[][]): AnomalyResult | null;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) * (b - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Rolling z-score detector over the recent per-helmet history window.
 * `history[i]` = [gasRaw, temperatureC, humidityPercent, accelMagnitudeG]
 */
export class RollingZScoreDetector implements AnomalyDetector {
  readonly name = "rolling-zscore-v1";

  constructor(
    private readonly sensitivitySigma = 3,
    private readonly minHistory = 12,
  ) {}

  detect(sample: HelmetSensorSample, history: number[][]): AnomalyResult | null {
    const featureIndex: Record<AnomalyFeature, number> = {
      gasRaw: 0,
      temperatureC: 1,
      humidityPercent: 2,
      accelMagnitudeG: 3,
    };

    const candidateValues: { feature: AnomalyFeature; value: number }[] = [];
    if (typeof sample.gasRaw === "number") {
      candidateValues.push({ feature: "gasRaw", value: sample.gasRaw });
    }
    if (typeof sample.temperatureC === "number") {
      candidateValues.push({ feature: "temperatureC", value: sample.temperatureC });
    }
    if (typeof sample.humidityPercent === "number") {
      candidateValues.push({ feature: "humidityPercent", value: sample.humidityPercent });
    }
    if (typeof sample.accelMagnitudeG === "number") {
      candidateValues.push({ feature: "accelMagnitudeG", value: sample.accelMagnitudeG });
    }
    if (candidateValues.length === 0) return null;

    if (history.length < this.minHistory) {
      return {
        score: 0,
        maxSigma: 0,
        feature: null,
        value: null,
        baselineMean: null,
        baselineStdDev: null,
        label: "insufficient_history",
        reason: `Baseline still warming up: ${history.length}/${this.minHistory} samples collected for this helmet.`,
        detector: this.name,
      };
    }

    let worst: { feature: AnomalyFeature; sigma: number; mean: number; sd: number; value: number } | null =
      null;

    for (const candidate of candidateValues) {
      const series = history
        .map((row) => row[featureIndex[candidate.feature]])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (series.length < this.minHistory) continue;
      const m = mean(series);
      const sd = stdDev(series);
      if (sd <= 1e-6) continue;
      const sigma = Math.abs(candidate.value - m) / sd;
      if (!worst || sigma > worst.sigma) {
        worst = { feature: candidate.feature, sigma, mean: m, sd, value: candidate.value };
      }
    }

    if (!worst) {
      return {
        score: 0,
        maxSigma: 0,
        feature: null,
        value: null,
        baselineMean: null,
        baselineStdDev: null,
        label: "normal",
        reason: "Baseline variance is too small to score; sample treated as normal.",
        detector: this.name,
      };
    }

    const ratio = worst.sigma / this.sensitivitySigma;
    const score = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio / 2 : 0));
    const label: AnomalyResult["label"] =
      worst.sigma >= this.sensitivitySigma * 1.5
        ? "anomalous"
        : worst.sigma >= this.sensitivitySigma
          ? "watch"
          : "normal";

    return {
      score,
      maxSigma: Number(worst.sigma.toFixed(3)),
      feature: worst.feature,
      value: worst.value,
      baselineMean: Number(worst.mean.toFixed(3)),
      baselineStdDev: Number(worst.sd.toFixed(3)),
      label,
      reason:
        label === "normal"
          ? `${worst.feature} is within ${worst.sigma.toFixed(2)}σ of the recent baseline (mean ${worst.mean.toFixed(2)}).`
          : `${worst.feature} = ${worst.value.toFixed(2)} deviates ${worst.sigma.toFixed(2)}σ from the recent baseline (mean ${worst.mean.toFixed(2)}, σ ${worst.sd.toFixed(2)}). Threshold ${this.sensitivitySigma}σ.`,
      detector: this.name,
    };
  }
}

export const defaultAnomalyDetector: AnomalyDetector = new RollingZScoreDetector();

export function describeAnomaly(result: AnomalyResult | null): string {
  if (!result) return "Anomaly detection did not run for this sample.";
  return `${result.detector}: ${result.reason}`;
}
