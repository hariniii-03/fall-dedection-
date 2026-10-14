"""SQLAlchemy models + Pydantic request schemas for the FastAPI backend."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./minesafe.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Helmet(Base):
    __tablename__ = "helmets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    firmware_version: Mapped[str] = mapped_column(String(64), default="esp32-s3-1.0.0")
    gas_sensor_model: Mapped[str] = mapped_column(String(64), default="MQ-135")
    sensors: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    battery_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    connection_state: Mapped[str] = mapped_column(String(16), default="offline")
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_reading_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    department: Mapped[str] = mapped_column(String(80), default="General")
    zone: Mapped[str] = mapped_column(String(80), default="Zone-A")
    helmet_code: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("helmets.code"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Reading(Base):
    __tablename__ = "sensor_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    helmet_code: Mapped[str] = mapped_column(String(64), index=True)
    worker_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    gas_raw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    humidity_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pressure_hpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    accel_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    accel_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    accel_z: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    anomaly_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    anomaly_label: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="device")
    device_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "helmet_id": self.helmet_code,
            "worker_id": self.worker_code,
            "gas_raw": self.gas_raw,
            "temperature_c": self.temperature_c,
            "humidity_percent": self.humidity_percent,
            "pressure_hpa": self.pressure_hpa,
            "accel_x": self.accel_x,
            "accel_y": self.accel_y,
            "accel_z": self.accel_z,
            "accel_magnitude_g": (sum((self.accel_x or 0) ** 2, (self.accel_y or 0) ** 2, (self.accel_z or 0) ** 2)) ** 0.5,
            "battery_percent": self.battery_percent,
            "anomaly_label": self.anomaly_label,
            "source": self.source,
            "received_at": self.received_at.isoformat() if self.received_at else None,
        }


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(24))
    severity: Mapped[str] = mapped_column(String(16), default="warning")
    status: Mapped[str] = mapped_column(String(16), default="active")
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(600))
    explanation: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    detector: Mapped[str] = mapped_column(String(16), default="rule")
    rule_id: Mapped[Optional[str]] = mapped_column(String(48), nullable=True)
    helmet_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    worker_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    measured_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    threshold: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dedupe_key: Mapped[Optional[str]] = mapped_column(String(120), index=True, nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolution_notes: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "status": self.status,
            "title": self.title,
            "message": self.message,
            "explanation": self.explanation,
            "detector": self.detector,
            "rule_id": self.rule_id,
            "helmet": self.helmet_code,
            "worker": self.worker_code,
            "measured_value": self.measured_value,
            "threshold": self.threshold,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SensorAvailability(BaseModel):
    gas: bool = True
    temperature: bool = True
    humidity: bool = True
    accelerometer: bool = True
    pressure: bool = False
    battery: bool = True


class ReadingCreate(BaseModel):
    helmet_id: str = Field(min_length=1, max_length=64)
    worker_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    gas_raw: Optional[float] = Field(default=None, ge=0, le=65535)
    temperature_c: Optional[float] = Field(default=None, ge=-40, le=150)
    humidity_percent: Optional[float] = Field(default=None, ge=0, le=100)
    pressure_hpa: Optional[float] = Field(default=None, ge=300, le=1200)
    accel_x: Optional[float] = Field(default=None, ge=-16, le=16)
    accel_y: Optional[float] = Field(default=None, ge=-16, le=16)
    accel_z: Optional[float] = Field(default=None, ge=-16, le=16)
    battery_percent: Optional[float] = Field(default=None, ge=0, le=100)
    source: Literal["device", "simulated"] = "device"

    @field_validator("helmet_id")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("source")
    @classmethod
    def _source(cls, value: str) -> str:
        if value not in {"device", "simulated"}:
            raise ValueError("source must be 'device' or 'simulated'")
        return value


class AlertCreate(BaseModel):
    type: str
    severity: str = "warning"
    title: str
    message: str
    helmet_code: Optional[str] = None
    worker_code: Optional[str] = None
    measured_value: Optional[float] = None
    threshold: Optional[float] = None
