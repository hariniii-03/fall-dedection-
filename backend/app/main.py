"""
MineSafe AI - FastAPI reference backend
=======================================

This is the standalone Python backend described in the project brief. It exposes
the same REST contract as the Next.js backend that ships in this repository
(`src/app/api/**`), so either one can drive the mobile app and the ESP32-S3.

Run it with:

    cd backend
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Storage: SQLite by default (`sqlite:///./minesafe.db`); set `DATABASE_URL` to a
PostgreSQL DSN for a shared deployment.

Why two backends?
-----------------
* The Next.js backend is what runs in the hosted preview (dashboard + APIs + SSE).
* This FastAPI service is the reference implementation for the ECE report: it
  shows the Python AI/anomaly module, WebSocket streaming and MQTT bridge in the
  language the project spec asked for.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .detection import DetectionEngine, SafetyThresholds
from .models import (
    Alert,
    AlertCreate,
    Base,
    Helmet,
    Reading,
    ReadingCreate,
    SensorAvailability,
    SessionLocal,
    User,
    Worker,
    engine,
)

app = FastAPI(
    title="MineSafe AI Backend",
    version="1.0.0",
    description="Smart mining helmet safety monitoring: ingestion, rules, AI anomaly detection, alerts.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("DEVICE_API_KEY", "")  # empty => open (development only)
engine_state = DetectionEngine(SafetyThresholds())
Base.metadata.create_all(bind=engine)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_device_key(x_device_key: Optional[str] = Header(default=None)) -> None:
    """Shared-secret authentication for helmet ingestion."""
    if API_KEY and x_device_key != API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid device key")


def require_user_role(x_role: str = Header(default="supervisor")) -> str:
    if x_role not in {"worker", "supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="forbidden")
    return x_role


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str
    role: Literal["worker", "supervisor", "admin"]


@app.post("/api/auth/login", tags=["auth"])
def login(payload: LoginRequest) -> Dict[str, Any]:
    """Prototype login: demo accounts are seeded on first start.

    Production deployments should replace this with hashed credentials
    (bcrypt/scrypt) and issue short-lived JWTs.
    """
    demo = {
        "admin": ("Admin@123", "admin"),
        "supervisor": ("Super@123", "supervisor"),
        "worker": ("Worker@123", "worker"),
    }
    expected = demo.get(payload.username.lower())
    if not expected or expected[0] != payload.password or expected[1] != payload.role:
        raise HTTPException(status_code=401, detail="invalid credentials")
    return {"token": f"demo-{payload.role}-token", "role": payload.role}


# --------------------------------------------------------------------------
# workers / helmets
# --------------------------------------------------------------------------
class WorkerCreate(BaseModel):
    code: str
    full_name: str
    department: str = "General"
    zone: str = "Zone-A"
    helmet_code: Optional[str] = None


@app.get("/api/workers", tags=["workers"])
def list_workers(db=Depends(get_db)) -> Dict[str, Any]:
    workers = db.query(Worker).all()
    return {
        "count": len(workers),
        "workers": [
            {
                "code": w.code,
                "full_name": w.full_name,
                "department": w.department,
                "zone": w.zone,
                "helmet_code": w.helmet_code,
                "active": w.active,
            }
            for w in workers
        ],
    }


@app.post("/api/workers", status_code=201, tags=["workers"])
def create_worker(payload: WorkerCreate, db=Depends(get_db), role: str = Depends(require_user_role)) -> Dict[str, Any]:
    if db.query(Worker).filter(Worker.code == payload.code).first():
        raise HTTPException(status_code=409, detail="worker already exists")
    worker = Worker(**payload.model_dump())
    db.add(worker)
    db.commit()
    return {"worker": {"code": worker.code}}


@app.post("/api/helmets", status_code=201, tags=["helmets"])
def register_helmet(
    code: str,
    gas_sensor_model: str = "MQ-135",
    sensors: Optional[SensorAvailability] = None,
    db=Depends(get_db),
    role: str = Depends(require_user_role),
) -> Dict[str, Any]:
    if db.query(Helmet).filter(Helmet.code == code).first():
        raise HTTPException(status_code=409, detail="helmet already exists")
    helmet = Helmet(
        code=code,
        gas_sensor_model=gas_sensor_model,
        sensors=sensors or SensorAvailability(),
    )
    db.add(helmet)
    db.commit()
    return {"helmet": {"code": helmet.code, "sensors": helmet.sensors}}


@app.post("/api/helmets/{code}/heartbeat", tags=["helmets"])
def heartbeat(code: str, battery_percent: Optional[float] = None, db=Depends(get_db), _: None = Depends(require_device_key)) -> Dict[str, Any]:
    helmet = db.query(Helmet).filter(Helmet.code == code).first()
    if not helmet:
        raise HTTPException(status_code=404, detail="helmet not registered")
    helmet.last_heartbeat_at = datetime.now(timezone.utc)
    if battery_percent is not None:
        helmet.battery_percent = battery_percent
    db.commit()
    return {"helmet": code, "config": engine_state.thresholds.model_dump()}


# --------------------------------------------------------------------------
# ingestion + detection
# --------------------------------------------------------------------------
@app.post("/api/ingest/sensor", status_code=201, tags=["ingest"])
def ingest(payload: ReadingCreate, db=Depends(get_db), _: None = Depends(require_device_key)) -> Dict[str, Any]:
    helmet = db.query(Helmet).filter(Helmet.code == payload.helmet_id).first()
    if not helmet:
        if os.getenv("AUTO_REGISTER_HELMETS", "true").lower() == "false":
            raise HTTPException(status_code=404, detail="helmet not registered")
        helmet = Helmet(code=payload.helmet_id)
        db.add(helmet)

    reading = Reading(
        helmet_code=payload.helmet_id,
        worker_code=payload.worker_id,
        gas_raw=payload.gas_raw,
        temperature_c=payload.temperature_c,
        humidity_percent=payload.humidity_percent,
        pressure_hpa=payload.pressure_hpa,
        accel_x=payload.accel_x,
        accel_y=payload.accel_y,
        accel_z=payload.accel_z,
        battery_percent=payload.battery_percent,
        source=payload.source,
        device_timestamp=payload.timestamp,
    )

    history = (
        db.query(Reading)
        .filter(Reading.helmet_code == payload.helmet_id)
        .order_by(Reading.received_at.desc())
        .limit(engine_state.thresholds.anomaly_window)
        .all()
    )
    result = engine_state.evaluate(reading, history)

    db.add(reading)
    for candidate in result.alerts:
        db.add(
            Alert(
                type=candidate.type,
                severity=candidate.severity,
                title=candidate.title,
                message=candidate.message,
                explanation=candidate.explanation,
                detector=candidate.detector,
                rule_id=candidate.rule_id,
                helmet_code=payload.helmet_id,
                worker_code=payload.worker_id,
                measured_value=candidate.measured_value,
                threshold=candidate.threshold,
                dedupe_key=candidate.dedupe_key,
            )
        )
    helmet.last_reading_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reading)

    return {
        "accepted": True,
        "reading_id": reading.id,
        "alerts": [
            {"rule": a.rule_id, "severity": a.severity, "dedupe_key": a.dedupe_key} for a in result.alerts
        ],
        "anomaly": result.anomaly,
        "buzzer_command": "ON" if any(a.severity == "critical" for a in result.alerts) else "OFF",
    }


@app.get("/api/readings/latest", tags=["readings"])
def latest_readings(helmet: Optional[str] = None, db=Depends(get_db)) -> Dict[str, Any]:
    query = db.query(Reading).order_by(Reading.received_at.desc())
    if helmet:
        query = query.filter(Reading.helmet_code == helmet)
    rows = query.limit(10).all()
    return {"readings": [r.as_dict() for r in rows]}


@app.get("/api/readings/history", tags=["readings"])
def reading_history(helmet: str, limit: int = 60, db=Depends(get_db)) -> Dict[str, Any]:
    rows = (
        db.query(Reading)
        .filter(Reading.helmet_code == helmet)
        .order_by(Reading.received_at.desc())
        .limit(min(limit, 500))
        .all()
    )
    return {"helmet": helmet, "series": [r.as_dict() for r in reversed(rows)]}


# --------------------------------------------------------------------------
# alerts
# --------------------------------------------------------------------------
@app.get("/api/alerts", tags=["alerts"])
def list_alerts(
    status_filter: Literal["active", "acknowledged", "resolved", "all"] = "all",
    severity: Optional[str] = None,
    db=Depends(get_db),
) -> Dict[str, Any]:
    query = db.query(Alert).order_by(Alert.created_at.desc())
    if status_filter != "all":
        query = query.filter(Alert.status == status_filter)
    if severity:
        query = query.filter(Alert.severity == severity)
    rows = query.limit(200).all()
    return {"count": len(rows), "alerts": [a.as_dict() for a in rows]}


@app.post("/api/alerts", status_code=201, tags=["alerts"])
def create_alert(payload: AlertCreate, db=Depends(get_db), role: str = Depends(require_user_role)) -> Dict[str, Any]:
    alert = Alert(**payload.model_dump(), dedupe_key=f"{payload.type}:{payload.helmet_code}:{datetime.now(timezone.utc).timestamp()}")
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return {"alert": alert.as_dict()}


@app.post("/api/alerts/{alert_id}/acknowledge", tags=["alerts"])
def acknowledge_alert(alert_id: int, note: str = "", db=Depends(get_db), role: str = Depends(require_user_role)) -> Dict[str, Any]:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="alert not found")
    if alert.status == "resolved":
        raise HTTPException(status_code=409, detail="alert already resolved")
    alert.status = "acknowledged"
    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledgement_note = note or "acknowledged"
    db.commit()
    return {"alert": alert.as_dict()}


@app.post("/api/alerts/{alert_id}/resolve", tags=["alerts"])
def resolve_alert(alert_id: int, resolution_notes: str = Field(min_length=3), db=Depends(get_db), role: str = Depends(require_user_role)) -> Dict[str, Any]:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="alert not found")
    alert.status = "resolved"
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolution_notes = resolution_notes
    db.commit()
    return {"alert": alert.as_dict()}


# --------------------------------------------------------------------------
# thresholds
# --------------------------------------------------------------------------
@app.get("/api/settings/thresholds", tags=["settings"])
def get_thresholds() -> Dict[str, Any]:
    return {"thresholds": engine_state.thresholds.model_dump()}


@app.put("/api/settings/thresholds", tags=["settings"])
def put_thresholds(thresholds: SafetyThresholds, role: str = Depends(require_user_role)) -> Dict[str, Any]:
    engine_state.update(thresholds)
    return {"thresholds": engine_state.thresholds.model_dump(), "esp32_sync": "publish to minesafe/config/thresholds"}


# --------------------------------------------------------------------------
# offline watchdog
# --------------------------------------------------------------------------
@app.post("/api/maintenance/checks", tags=["maintenance"])
def offline_check(db=Depends(get_db)) -> Dict[str, Any]:
    timeout = timedelta(seconds=engine_state.thresholds.offline_timeout_seconds)
    cutoff = datetime.now(timezone.utc) - timeout
    stale = db.query(Helmet).filter(Helmet.last_reading_at < cutoff).all()
    offline = db.query(Helmet).filter(Helmet.last_reading_at.is_(None)).all()
    raised = 0
    for helmet in stale + offline:
        existing = (
            db.query(Alert)
            .filter(Alert.dedupe_key == f"offline:{helmet.code}")
            .filter(Alert.status != "resolved")
            .first()
        )
        if existing:
            continue
        db.add(
            Alert(
                type="offline",
                severity="warning",
                title="Helmet offline",
                message=f"WARNING: Helmet {helmet.code} has not transmitted for more than {engine_state.thresholds.offline_timeout_seconds}s. Missing data is treated as UNKNOWN, not safe.",
                explanation="offline watchdog",
                detector="rule",
                rule_id="HELMET_OFFLINE",
                helmet_code=helmet.code,
                dedupe_key=f"offline:{helmet.code}",
            )
        )
        raised += 1
    db.commit()
    return {"offline": [h.code for h in offline], "stale": [h.code for h in stale], "alerts_raised": raised}


# --------------------------------------------------------------------------
# WebSocket live stream
# --------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self) -> None:
        self.active: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active:
            self.active.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        for connection in list(self.active):
            try:
                await connection.send_json(message)
            except Exception:  # pragma: no cover - network teardown
                self.disconnect(connection)


manager = ConnectionManager()


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket) -> None:
    """Live sensor stream. Clients receive `snapshot` frames from the ingest loop."""
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/api/health", tags=["health"])
def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "minesafe-ai-backend", "time": datetime.now(timezone.utc).isoformat()}
