"""
Rule-based hazard detection + modular AI anomaly detection (Python side).

Pure functions, no database access, so the module is trivially unit-testable
(see backend/tests/test_detection.py).
"""
from __future__ import annotations

import math
import statistics
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from pydantic import BaseModel, Field


class SafetyThresholds(BaseModel):
    gas_warning: float = 900.0
    gas_critical: float = 1400.0
    temperature_warning: float = 38.0
    temperature_critical: float = 43.0
    humidity_warning: float = 85.0
    battery_low: float = 25.0
    offline_timeout_seconds: int = 90
    fall_impact_g: float = 2.6
    fall_free_fall_g: float = 0.45
    fall_window_ms: int = 1200
    anomaly_enabled: bool = True
    anomaly_sensitivity: float = Field(default=3.0, ge=1.5, le=6)
    anomaly_window: int = Field(default=40, ge=10, le=500)
    alert_cooldown_seconds: int = 0


class Candidate(BaseModel):
    type: str
    severity: str
    title: str
    message: str
    explanation: str
    rule_id: str
    detector: str = "rule"
    measured_value: Optional[float] = None
    threshold: Optional[float] = None
    dedupe_key: str


class DetectionResult(BaseModel):
    alerts: List[Candidate]
    anomaly: Optional[Dict[str, Any]] = None


FEATURES = ("gas_raw", "temperature_c", "humidity_percent", "accel_magnitude_g")


class AnomalyDetector:
    """Interface for pluggable anomaly detectors.

    Implement `score()` and return (sigma, feature_name) or None. A trained
    model (e.g. scikit-learn IsolationForest, or an autoencoder) can be dropped
    in here later without touching the rule engine.
    """

    name = "base"

    def score(self, sample: Dict[str, Optional[float]], history: Sequence[Dict[str, Optional[float]]]):
        raise NotImplementedError


class RollingZScoreDetector(AnomalyDetector):
    """Transparent statistical detector over the recent per-helmet baseline."""

    name = "rolling-zscore-v1"

    def __init__(self, sensitivity: float = 3.0, min_history: int = 12) -> None:
        self.sensitivity = sensitivity
        self.min_history = min_history

    def score(self, sample: Dict[str, Optional[float]], history: Sequence[Dict[str, Optional[float]]]):
        if len(history) < self.min_history:
            return None, "insufficient_history"

        worst: Optional[tuple[float, str, float, float]] = None
        for feature in FEATURES:
            value = sample.get(feature)
            if value is None:
                continue
            series = [h[feature] for h in history if isinstance(h.get(feature), (int, float))]
            if len(series) < self.min_history:
                continue
            mean = statistics.fmean(series)
            stdev = statistics.stdev(series)
            if stdev <= 1e-6:
                continue
            sigma = abs(value - mean) / stdev
            if worst is None or sigma > worst[0]:
                worst = (sigma, feature, mean, stdev)

        if worst is None:
            return 0.0, "normal"
        sigma, feature, mean, stdev = worst
        return sigma, f"{feature}={value:.2f} is {sigma:.2f}σ from baseline (μ={mean:.2f}, σ={stdev:.2f})"


class DetectionEngine:
    """Combines deterministic rules with the anomaly detector."""

    def __init__(self, thresholds: Optional[SafetyThresholds] = None) -> None:
        self.thresholds = thresholds or SafetyThresholds()
        self.anomaly_detector: AnomalyDetector = RollingZScoreDetector(
            self.thresholds.anomaly_sensitivity
        )

    def update(self, thresholds: SafetyThresholds) -> None:
        self.thresholds = thresholds
        self.anomaly_detector = RollingZScoreDetector(thresholds.anomaly_sensitivity)

    # -- helpers ---------------------------------------------------------
    @staticmethod
    def _magnitude(reading: Dict[str, Optional[float]]) -> Optional[float]:
        ax, ay, az = reading.get("accel_x"), reading.get("accel_y"), reading.get("accel_z")
        if ax is None or ay is None or az is None:
            return reading.get("accel_magnitude_g")
        scale = 1 / 9.81 if max(abs(ax), abs(ay), abs(az)) > 11 else 1.0
        return math.sqrt(ax * ax + ay * ay + az * az) * scale

    def _features(self, reading: Dict[str, Optional[float]]) -> Dict[str, Optional[float]]:
        features = dict(reading)
        features["accel_magnitude_g"] = self._magnitude(reading)
        return features

    # -- rules -----------------------------------------------------------
    def evaluate(self, reading: Any, history: Sequence[Any]) -> DetectionResult:
        """`reading`/`history` may be ORM rows or plain dicts."""
        sample: Dict[str, Optional[float]] = {
            "gas_raw": getattr(reading, "gas_raw", None) if not isinstance(reading, dict) else reading.get("gas_raw"),
            "temperature_c": getattr(reading, "temperature_c", None) if not isinstance(reading, dict) else reading.get("temperature_c"),
            "humidity_percent": getattr(reading, "humidity_percent", None) if not isinstance(reading, dict) else reading.get("humidity_percent"),
            "accel_x": getattr(reading, "accel_x", None) if not isinstance(reading, dict) else reading.get("accel_x"),
            "accel_y": getattr(reading, "accel_y", None) if not isinstance(reading, dict) else reading.get("accel_y"),
            "accel_z": getattr(reading, "accel_z", None) if not isinstance(reading, dict) else reading.get("accel_z"),
            "battery_percent": getattr(reading, "battery_percent", None) if not isinstance(reading, dict) else reading.get("battery_percent"),
        }
        helmet_code = getattr(reading, "helmet_code", None) or (reading.get("helmet_id") if isinstance(reading, dict) else "") or "UNKNOWN"
        workers = getattr(reading, "worker_code", None) or (reading.get("worker_id") if isinstance(reading, dict) else None) or "unknown worker"

        candidates: List[Candidate] = []
        gas = sample["gas_raw"]
        if gas is not None and gas >= self.thresholds.gas_warning:
            severity = "critical" if gas >= self.thresholds.gas_critical else "warning"
            candidates.append(
                Candidate(
                    type="gas",
                    severity=severity,
                    title="Hazardous air quality" if severity == "critical" else "Air quality warning",
                    message=(
                        f"CRITICAL: Hazardous air-quality reading detected for Worker {workers}. "
                        "Check the worker's location and initiate the appropriate safety procedure."
                        if severity == "critical"
                        else f"WARNING: Air-quality reading for Worker {workers} is above the warning threshold."
                    ),
                    explanation=(
                        f"MQ-135 raw {gas:.0f} exceeded the {severity} threshold "
                        f"{self.thresholds.gas_critical if severity == 'critical' else self.thresholds.gas_warning:.0f}. "
                        "Raw MQ-135 output is an air-quality indicator, not a calibrated concentration."
                    ),
                    rule_id=f"GAS_{severity.upper()}",
                    measured_value=gas,
                    threshold=self.thresholds.gas_critical if severity == "critical" else self.thresholds.gas_warning,
                    dedupe_key=f"gas:{helmet_code}:{severity}",
                )
            )

        temp = sample["temperature_c"]
        if temp is not None and temp >= self.thresholds.temperature_warning:
            severity = "critical" if temp >= self.thresholds.temperature_critical else "warning"
            candidates.append(
                Candidate(
                    type="temperature",
                    severity=severity,
                    title="Critical helmet temperature" if severity == "critical" else "High temperature",
                    message=f"{severity.upper()}: Temperature {temp:.1f}°C recorded for Worker {workers}.",
                    explanation=f"Temperature {temp:.1f}°C crossed the configured {severity} threshold.",
                    rule_id=f"TEMP_{severity.upper()}",
                    measured_value=temp,
                    threshold=self.thresholds.temperature_critical if severity == "critical" else self.thresholds.temperature_warning,
                    dedupe_key=f"temperature:{helmet_code}:{severity}",
                )
            )

        magnitude = self._magnitude(sample)
        if magnitude is not None and magnitude >= self.thresholds.fall_impact_g:
            candidates.append(
                Candidate(
                    type="fall",
                    severity="critical",
                    title="Suspected fall detected",
                    message=f"EMERGENCY: A possible fall was detected for Worker {workers}. Verify the worker's condition immediately.",
                    explanation=(
                        f"|accel| {magnitude:.2f}g >= impact threshold {self.thresholds.fall_impact_g}g. "
                        "Confirm with the accelerometer trace before dispatching rescue."
                    ),
                    rule_id="FALL_IMPACT",
                    measured_value=magnitude,
                    threshold=self.thresholds.fall_impact_g,
                    dedupe_key=f"fall:{helmet_code}",
                )
            )

        battery = sample["battery_percent"]
        if battery is not None and battery <= self.thresholds.battery_low:
            candidates.append(
                Candidate(
                    type="battery",
                    severity="warning",
                    title="Helmet battery low",
                    message=f"WARNING: Helmet {helmet_code} battery is at {battery:.0f}%. Recharge before the next shift.",
                    explanation=f"Battery {battery:.0f}% <= configured {self.thresholds.battery_low}%.",
                    rule_id="BATTERY_LOW",
                    measured_value=battery,
                    threshold=self.thresholds.battery_low,
                    dedupe_key=f"battery:{helmet_code}",
                )
            )

        anomaly_payload: Optional[Dict[str, Any]] = None
        if self.thresholds.anomaly_enabled:
            history_dicts = [self._features(r if isinstance(r, dict) else {c: getattr(r, c, None) for c in FEATURES}) for r in history]
            sigma, detail = self.anomaly_detector.score(self._features(sample), history_dicts)
            anomaly_payload = {"sigma": sigma, "detector": self.anomaly_detector.name, "detail": detail}
            if sigma and sigma >= self.thresholds.anomaly_sensitivity:
                candidates.append(
                    Candidate(
                        type="anomaly",
                        severity="warning",
                        title="Unusual sensor pattern (AI)",
                        message=f"WARNING: Unusual sensor pattern for Helmet {helmet_code}. {detail}",
                        explanation=f"{self.anomaly_detector.name}: {detail}. Statistical detector - not a prediction of an accident.",
                        rule_id="ANOMALY_PATTERN",
                        detector="anomaly",
                        dedupe_key=f"anomaly:{helmet_code}",
                    )
                )

        return DetectionResult(alerts=candidates, anomaly=anomaly_payload)


def analyse_fall_sequence(
    samples: Sequence[float],
    impact_g: float = 2.6,
    free_fall_g: float = 0.45,
) -> Dict[str, Any]:
    """Fall heuristic used by the unit tests with recorded accelerometer traces."""
    if len(samples) < 2:
        return {"suspected_fall": False, "reason": "not enough samples", "confidence": "low"}
    peak = max(samples)
    minimum = min(samples)
    impact_index = next((i for i, s in enumerate(samples) if s >= impact_g), None)
    if impact_index is None:
        return {"suspected_fall": False, "peak_g": peak, "min_g": minimum, "reason": "no impact", "confidence": "low"}
    pre = samples[max(0, impact_index - 4) : impact_index]
    if any(s <= free_fall_g for s in pre):
        return {
            "suspected_fall": True,
            "peak_g": peak,
            "min_g": minimum,
            "reason": "free-fall phase followed by impact",
            "confidence": "high" if peak >= impact_g * 1.5 else "medium",
        }
    return {"suspected_fall": False, "peak_g": peak, "min_g": minimum, "reason": "impact without free-fall", "confidence": "low"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
