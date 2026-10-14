"""MineSafe API prototype: real readings and alerts are never represented as calibrated AQI."""
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from pwdlib import PasswordHash
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, create_engine, select
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()
app = FastAPI(title='MineSafe AI', version='0.1.0')
_hasher = PasswordHash.recommended()


def now():
    return datetime.now(timezone.utc)


def database():
    engine = create_engine(os.getenv('DATABASE_URL', 'sqlite:///./minesafe.db'), connect_args={'check_same_thread': False} if os.getenv('DATABASE_URL', 'sqlite:///./minesafe.db').startswith('sqlite') else {})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def init_db():
    with database() as db:
        db.commit()


class User(Base):
    __tablename__ = 'users'
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)


class Worker(Base):
    __tablename__ = 'workers'
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    zone = Column(String, nullable=False, default='Unknown')
    active = Column(Boolean, default=True)
    helmet_id = Column(String, nullable=True)


class Helmet(Base):
    __tablename__ = 'helmets'
    id = Column(String, primary_key=True)
    worker_id = Column(String, ForeignKey('workers.id'), nullable=True)
    key_hash = Column(String, nullable=False)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    firmware = Column(String, nullable=True)
    sensors = Column(JSON, nullable=False, default=dict)


class Sample(Base):
    __tablename__ = 'readings'
    id = Column(Integer, primary_key=True)
    helmet_id = Column(String, ForeignKey('helmets.id'), nullable=False)
    worker_id = Column(String, nullable=True)
    ts = Column(DateTime(timezone=True), nullable=False)
    gas_raw = Column(Integer, nullable=True)
    temperature_c = Column(Float, nullable=True)
    humidity_percent = Column(Float, nullable=True)
    accel_x = Column(Float, nullable=True)
    accel_y = Column(Float, nullable=True)
    accel_z = Column(Float, nullable=True)
    battery_percent = Column(Float, nullable=True)
    pressure_hpa = Column(Float, nullable=True)
    simulated = Column(Boolean, nullable=False, default=False)


class Incident(Base):
    __tablename__ = 'alerts'
    id = Column(Integer, primary_key=True)
    type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    state = Column(String, nullable=False, default='active')
    worker_id = Column(String, nullable=True)
    helmet_id = Column(String, nullable=False)
    message = Column(String, nullable=False)
    detail = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by = Column(String, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(String, nullable=True)
    resolution_notes = Column(String, nullable=True)
    simulated = Column(Boolean, default=False)


class PushToken(Base):
    __tablename__ = 'push_tokens'
    token = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey('users.id'), nullable=False)
    platform = Column(String, nullable=False)


class ReadingIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    helmet_id: str = Field(min_length=1, max_length=64)
    worker_id: str | None = None
    timestamp: datetime
    gas_raw: int | None = Field(default=None, ge=0, le=4095)
    temperature_c: float | None = Field(default=None, ge=-40, le=125)
    humidity_percent: float | None = Field(default=None, ge=0, le=100)
    accel_x: float | None = Field(default=None, ge=-200, le=200)
    accel_y: float | None = Field(default=None, ge=-200, le=200)
    accel_z: float | None = Field(default=None, ge=-200, le=200)
    battery_percent: float | None = Field(default=None, ge=0, le=100)
    pressure_hpa: float | None = Field(default=None, ge=300, le=1100)
    simulated: bool = False

    @field_validator('timestamp')
    @classmethod
    def tz_required(cls, value):
        if value.tzinfo is None:
            raise ValueError('timestamp must contain a time zone')
        return value


class Login(BaseModel):
    username: str
    password: str


class Notes(BaseModel):
    notes: str = Field(min_length=1, max_length=2000)


class Sos(BaseModel):
    workerId: str | None = None
    helmetId: str | None = None


class Registration(BaseModel):
    token: str = Field(min_length=5, max_length=500)
    platform: Literal['android', 'ios']


class Thresholds(BaseModel):
    gasWarning: int = Field(default=1100, ge=0, le=4095)
    gasCritical: int = Field(default=1500, ge=0, le=4095)
    tempWarningC: float = Field(default=38, ge=-40, le=125)
    tempCriticalC: float = Field(default=42, ge=-40, le=125)
    lowBatteryPercent: float = Field(default=20, ge=0, le=100)
    offlineTimeoutSec: int = Field(default=120, ge=10, le=86400)


_settings = Thresholds()
_cooldown = int(os.getenv('ALERT_COOLDOWN_SECONDS', '60'))


def secret():
    s = os.getenv('JWT_SECRET')
    if not s or len(s) < 32:
        raise RuntimeError('Set JWT_SECRET to a random string of at least 32 characters')
    return s


def auth(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Authentication required')
    try:
        data = jwt.decode(authorization[7:], secret(), algorithms=['HS256'])
        with database() as db:
            user = db.get(User, data['sub'])
            if user:
                return {'id': user.id, 'role': user.role, 'name': user.name}
    except (jwt.PyJWTError, KeyError):
        pass
    raise HTTPException(401, 'Invalid token')


def require(user, *roles):
    if user['role'] not in roles:
        raise HTTPException(403, 'Not authorized')


def public_alert(a):
    return dict(id=str(a.id), type=a.type, severity=a.severity, state=a.state, workerId=a.worker_id, helmetId=a.helmet_id, message=a.message, detail=a.detail, createdAt=a.created_at.isoformat(), acknowledgedAt=a.acknowledged_at.isoformat() if a.acknowledged_at else None, resolvedAt=a.resolved_at.isoformat() if a.resolved_at else None, resolutionNotes=a.resolution_notes, read=a.acknowledged_at is not None, simulated=a.simulated)


def public_reading(r):
    return dict(helmetId=r.helmet_id, workerId=r.worker_id, ts=r.ts.isoformat(), gasRaw=r.gas_raw, temperatureC=r.temperature_c, humidityPercent=r.humidity_percent, accelX=r.accel_x, accelY=r.accel_y, accelZ=r.accel_z, batteryPercent=r.battery_percent, pressureHpa=r.pressure_hpa, simulated=r.simulated)


def record_alert(db, type_, severity, helmet, worker, message, detail, simulated=False):
    prior = db.scalar(select(Incident).where(Incident.helmet_id == helmet, Incident.type == type_, Incident.state != 'resolved').order_by(Incident.created_at.desc()).limit(1))
    if prior and (now() - prior.created_at.replace(tzinfo=timezone.utc)).total_seconds() < _cooldown:
        return prior
    a = Incident(type=type_, severity=severity, helmet_id=helmet, worker_id=worker, message=message, detail=detail, created_at=now(), simulated=simulated)
    db.add(a)
    db.flush()
    return a


@app.post('/api/auth/login')
def login(payload: Login):
    with database() as db:
        user = db.get(User, payload.username)
        if not user or not _hasher.verify(payload.password, user.password_hash):
            raise HTTPException(401, 'Invalid credentials')
        token = jwt.encode({'sub': user.id, 'exp': now() + timedelta(hours=8)}, secret(), algorithm='HS256')
        return {'token': token, 'userId': user.id, 'role': user.role, 'name': user.name}


@app.post('/api/readings', status_code=201)
def ingest(payload: ReadingIn, x_device_key: str | None = Header(default=None)):
    with database() as db:
        helmet = db.get(Helmet, payload.helmet_id)
        if not helmet or not x_device_key or not _hasher.verify(x_device_key, helmet.key_hash):
            raise HTTPException(401, 'Unknown device or invalid key')
        if helmet.worker_id != payload.worker_id:
            raise HTTPException(409, 'Helmet assignment mismatch')
        if payload.timestamp > now() + timedelta(minutes=5) or payload.timestamp < now() - timedelta(days=1):
            raise HTTPException(422, 'Timestamp outside accepted range')
        values = payload.model_dump(exclude={'helmet_id', 'worker_id', 'timestamp'})
        sample = Sample(helmet_id=helmet.id, worker_id=helmet.worker_id, ts=payload.timestamp, **values)
        db.add(sample)
        helmet.last_heartbeat = now()
        for type_, value, threshold, severity, unit in [('gas', payload.gas_raw, _settings.gasCritical, 'critical', 'raw ADC'), ('temperature', payload.temperature_c, _settings.tempCriticalC, 'critical', '°C'), ('battery', -payload.battery_percent if payload.battery_percent is not None else None, -_settings.lowBatteryPercent, 'warning', '%')]:
            if value is not None and value >= threshold:
                measured = -value if type_ == 'battery' else value
                configured = -threshold if type_ == 'battery' else threshold
                if type_ == 'battery' and measured > configured:
                    continue
                record_alert(db, type_, severity, helmet.id, helmet.worker_id, f'{type_.upper()} hazard for {helmet.worker_id or helmet.id}: {measured} {unit}', {'reading': measured, 'threshold': configured, 'unit': unit}, payload.simulated)
        db.commit()
        return public_reading(sample)


@app.get('/api/readings/latest')
def latest(user=Depends(auth)):
    with database() as db:
        items = db.scalars(select(Sample).order_by(Sample.id.desc()).limit(500)).all()
        seen = set()
        result = []
        for r in items:
            if r.helmet_id not in seen and (user['role'] != 'worker' or r.worker_id == user['id']):
                seen.add(r.helmet_id)
                result.append(public_reading(r))
        return result


@app.get('/api/alerts')
def alerts(state: str | None = None, user=Depends(auth)):
    with database() as db:
        items = db.scalars(select(Incident).order_by(Incident.id.desc()).limit(500)).all()
        return [public_alert(a) for a in items if (not state or a.state == state) and (user['role'] != 'worker' or a.worker_id == user['id'])]


@app.post('/api/alerts/{alert_id}/acknowledge')
def acknowledge(alert_id: int, user=Depends(auth)):
    require(user, 'supervisor', 'admin')
    with database() as db:
        a = db.get(Incident, alert_id)
        if not a:
            raise HTTPException(404, 'Alert not found')
        if a.state == 'resolved':
            raise HTTPException(409, 'Already resolved')
        if a.state == 'active':
            a.state, a.acknowledged_at, a.acknowledged_by = 'acknowledged', now(), user['id']
        db.commit()
        return public_alert(a)


@app.post('/api/alerts/{alert_id}/resolve')
def resolve(alert_id: int, payload: Notes, user=Depends(auth)):
    require(user, 'supervisor', 'admin')
    with database() as db:
        a = db.get(Incident, alert_id)
        if not a:
            raise HTTPException(404, 'Alert not found')
        if a.state == 'resolved':
            raise HTTPException(409, 'Already resolved')
        a.state, a.resolved_at, a.resolved_by, a.resolution_notes = 'resolved', now(), user['id'], payload.notes.strip()
        if not a.resolution_notes:
            raise HTTPException(422, 'Notes required')
        db.commit()
        return public_alert(a)


@app.post('/api/sos', status_code=201)
def sos(payload: Sos, user=Depends(auth)):
    worker = user['id'] if user['role'] == 'worker' else payload.workerId
    if user['role'] == 'worker' and payload.workerId not in (None, user['id']):
        raise HTTPException(403, 'Cannot raise SOS for another worker')
    with database() as db:
        w = db.get(Worker, worker) if worker else None
        if not w:
            raise HTTPException(404, 'Worker not found')
        helmet = w.helmet_id or 'APP-SOS'
        a = record_alert(db, 'sos', 'critical', helmet, w.id, f'EMERGENCY: SOS requested by {w.id}', {'source': 'app'})
        db.commit()
        return public_alert(a)


@app.get('/api/workers')
def workers(user=Depends(auth)):
    with database() as db:
        rows = db.scalars(select(Worker)).all()
        return [dict(id=w.id, name=w.name, helmetId=w.helmet_id, zone=w.zone, active=w.active, status='offline', lastSeen=None, recentIncidents=0) for w in rows if user['role'] != 'worker' or w.id == user['id']]


@app.get('/api/helmets')
def helmets(user=Depends(auth)):
    with database() as db:
        rows = db.scalars(select(Helmet)).all()
        return [dict(id=h.id, online=bool(h.last_heartbeat and (now() - h.last_heartbeat.replace(tzinfo=timezone.utc)).total_seconds() <= _settings.offlineTimeoutSec), batteryPercent=None, lastHeartbeat=h.last_heartbeat.isoformat() if h.last_heartbeat else None, firmware=h.firmware, sensors=h.sensors or {}, lastReading=None) for h in rows if user['role'] != 'worker' or h.worker_id == user['id']]


@app.get('/api/thresholds')
def get_thresholds(user=Depends(auth)):
    return _settings


@app.put('/api/thresholds')
def set_thresholds(payload: Thresholds, user=Depends(auth)):
    require(user, 'admin')
    if payload.gasWarning >= payload.gasCritical or payload.tempWarningC >= payload.tempCriticalC:
        raise HTTPException(422, 'Warning threshold must be below critical threshold')
    global _settings
    _settings = payload  # prototype only; persist in DB before production deployment
    return payload


@app.post('/api/notifications/register')
def register(payload: Registration, user=Depends(auth)):
    with database() as db:
        item = db.get(PushToken, payload.token)
        if item and item.user_id != user['id']:
            raise HTTPException(409, 'Token already assigned to another user')
        if not item:
            db.add(PushToken(token=payload.token, platform=payload.platform, user_id=user['id']))
        db.commit()
        return {'ok': True}
