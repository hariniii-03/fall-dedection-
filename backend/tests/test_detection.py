"""Backend tests: sensor payload validation, threshold rules and fall detection.

Run with:  cd backend && pytest -q
"""
from __future__ import annotations

import os
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from pydantic import ValidationError

from app.detection import DetectionEngine, SafetyThresholds, analyse_fall_sequence
from app.models import ReadingCreate

TH = SafetyThresholds()


def make_reading(**overrides: Any) -> ReadingCreate:
    base: Dict[str, Any] = {
        "helmet_id": "HELMET-001",
        "worker_id": "WORKER-001",
        "timestamp": "2026-10-14T10:30:00Z",
        "gas_raw": 700,
        "temperature_c": 32.5,
        "humidity_percent": 68,
        "accel_x": 0.15,
        "accel_y": 0.22,
        "accel_z": 0.985,
        "battery_percent": 82,
        "source": "device",
    }
    base.update(overrides)
    return ReadingCreate(**base)


# --------------------------- payload validation ---------------------------
def test_valid_payload_is_accepted() -> None:
    payload = make_reading()
    assert payload.helmet_id == "HELMET-001"
    assert payload.source == "device"


@pytest.mark.parametrize(
    "field,value",
    [
        ("gas_raw", -5),
        ("gas_raw", 99999),
        ("temperature_c", 900),
        ("humidity_percent", 120),
        ("battery_percent", 150),
        ("accel_z", 40),
    ],
)
def test_out_of_range_values_are_rejected(field: str, value: float) -> None:
    with pytest.raises(ValidationError):
        make_reading(**{field: value})


def test_payload_without_any_sensor_field_is_rejected() -> None:
    with pytest.raises(ValidationError):
        ReadingCreate(helmet_id="HELMET-001", source="device")


def test_unknown_fields_are_ignored_not_stored() -> None:
    payload = make_reading(extra_noise=123)
    assert not hasattr(payload, "extra_noise")


# --------------------------- threshold rules ------------------------------
def engine() -> DetectionEngine:
    return DetectionEngine(TH.model_copy())


def test_normal_reading_raises_no_alert() -> None:
    result = engine().evaluate(make_reading().model_dump(), [])
    assert result.alerts == []


def test_gas_warning_rule() -> None:
    result = engine().evaluate(make_reading(gas_raw=950).model_dump(), [])
    assert [a.rule_id for a in result.alerts] == ["GAS_WARNING"]


def test_gas_critical_rule() -> None:
    result = engine().evaluate(make_reading(gas_raw=1500).model_dump(), [])
    alert = result.alerts[0]
    assert alert.rule_id == "GAS_CRITICAL"
    assert alert.severity == "critical"
    assert "CRITICAL" in alert.message


def test_temperature_critical_rule() -> None:
    result = engine().evaluate(make_reading(temperature_c=45).model_dump(), [])
    assert result.alerts[0].rule_id == "TEMP_CRITICAL"


def test_low_battery_rule() -> None:
    result = engine().evaluate(make_reading(battery_percent=10).model_dump(), [])
    assert result.alerts[0].rule_id == "BATTERY_LOW"


def test_missing_gas_field_raises_no_gas_alert() -> None:
    result = engine().evaluate(make_reading(gas_raw=None).model_dump(), [])
    assert all(a.type != "gas" for a in result.alerts)


# --------------------------- fall detection -------------------------------
NORMAL: List[float] = [0.98, 1.0, 1.02, 0.99, 1.01, 1.0]
WALKING_THEN_FALL: List[float] = [1.0, 1.02, 0.30, 0.12, 3.4, 1.6, 0.95, 0.90]
HAND_BUMP: List[float] = [1.0, 1.05, 1.10, 3.1, 1.02, 0.99]  # impact, no free fall
SENSOR_NOISE_ONLY: List[float] = [0.97, 1.03, 0.99, 1.05, 0.96, 1.01]


def test_fall_sequence_with_free_fall_is_detected() -> None:
    analysis = analyse_fall_sequence(WALKING_THEN_FALL, impact_g=TH.fall_impact_g, free_fall_g=TH.fall_free_fall_g)
    assert analysis["suspected_fall"] is True
    assert analysis["confidence"] in {"medium", "high"}


def test_impact_without_free_fall_is_not_a_fall() -> None:
    analysis = analyse_fall_sequence(HAND_BUMP, impact_g=TH.fall_impact_g, free_fall_g=TH.fall_free_fall_g)
    assert analysis["suspected_fall"] is False


def test_normal_motion_is_not_a_fall() -> None:
    for trace in (NORMAL, SENSOR_NOISE_ONLY):
        analysis = analyse_fall_sequence(trace, impact_g=TH.fall_impact_g, free_fall_g=TH.fall_free_fall_g)
        assert analysis["suspected_fall"] is False


def test_fall_rule_fires_from_single_high_magnitude_reading() -> None:
    result = engine().evaluate(make_reading(accel_x=2.9, accel_y=-1.4, accel_z=0.35).model_dump(), [])
    fall = [a for a in result.alerts if a.type == "fall"]
    assert len(fall) == 1 and fall[0].severity == "critical"


# --------------------------- anomaly detector -----------------------------
def test_anomaly_detector_needs_history() -> None:
    result = engine().evaluate(make_reading(gas_raw=1900).model_dump(), [])
    assert result.anomaly is None or result.anomaly.get("sigma") in (None, 0.0)


def test_threshold_update_is_applied() -> None:
    eng = engine()
    eng.update(SafetyThresholds(gas_warning=200, gas_critical=400, fall_impact_g=8))
    result = eng.evaluate(make_reading(gas_raw=500).model_dump(), [])
    assert [a.rule_id for a in result.alerts if a.type == "gas"] == ["GAS_CRITICAL"]
