/**
 * SIMULATED DATA — development/testing only.
 * Every value produced here is test data. It must never be shown in the UI
 * without the visible "SIMULATED" label required by the project rules.
 * Replace with backend/WebSocket data when a helmet is connected.
 */
import { Reading, Alert, Worker, Helmet, Thresholds } from "./types";
import { SIMULATION_MODE_DEFAULT } from "./config";

export const SIMULATED_WORKERS: Worker[] = [
  { id: "WORKER-001", name: "R. Kumar", helmetId: "HELMET-001", zone: "Zone A", active: true, status: "normal", lastSeen: null, recentIncidents: 0 },
  { id: "WORKER-002", name: "S. Das", helmetId: "HELMET-002", zone: "Zone B", active: true, status: "warning", lastSeen: null, recentIncidents: 1 },
  { id: "WORKER-003", name: "A. Minj", helmetId: "HELMET-003", zone: "Zone C", active: true, status: "offline", lastSeen: null, recentIncidents: 0 },
];

export const DEFAULT_THRESHOLDS: Thresholds = {
  gasWarning: 800,
  gasCritical: 1500,
  tempWarningC: 38,
  tempCriticalC: 42,
  lowBatteryPercent: 20,
  offlineTimeoutSec: 120,
};

let seq = 0;

/** One plausible-but-fake reading; `simulated` is always true here. */
export function makeSimulatedReading(helmetId: string, workerId: string | null, drift = 0): Reading {
  seq += 1;
  const gasBase = 420 + Math.round(60 * Math.sin(seq / 9)) + drift;
  const t = 30 + 2 * Math.sin(seq / 14) + drift / 200;
  return {
    helmetId,
    workerId,
    ts: new Date().toISOString(),
    gasRaw: gasBase,
    temperatureC: Number(t.toFixed(1)),
    humidityPercent: Number((60 + 4 * Math.cos(seq / 11)).toFixed(1)),
    accelX: Number((0.1 + 0.05 * Math.sin(seq)).toFixed(2)),
    accelY: Number((0.2 + 0.05 * Math.cos(seq)).toFixed(2)),
    accelZ: Number((9.7 + 0.08 * Math.sin(seq / 3)).toFixed(2)),
    batteryPercent: Math.max(5, 82 - Math.floor(seq / 400)),
    pressureHpa: 1012,
    simulated: true,
  };
}

export function makeSimulatedAlert(type: Alert["type"], severity: Alert["severity"], workerId: string | null, helmetId: string): Alert {
  const msgs: Record<Alert["type"], string> = {
    gas: "CRITICAL: Hazardous air-quality reading detected. Check the worker's location and initiate the appropriate safety procedure.",
    fall: "EMERGENCY: A possible fall was detected. Verify the worker's condition immediately.",
    temperature: "WARNING: High temperature reading detected.",
    battery: "WARNING: Helmet battery low. Recharge or replace soon.",
    offline: "WARNING: Helmet stopped sending data. Last-known readings may be stale.",
    sos: "EMERGENCY: Worker pressed the SOS button. Respond immediately.",
  };
  return {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type, severity, state: "active",
    workerId, helmetId,
    message: msgs[type],
    detail: { source: "simulated" },
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNotes: null,
    read: false,
    simulated: true,
  };
}

export const SIMULATED_HELMETS: Helmet[] = SIMULATED_WORKERS.map((w, i) => ({
  id: w.helmetId ?? `HELMET-00${i + 1}`,
  online: w.status !== "offline",
  batteryPercent: [82, 17, 0][i] ?? 50,
  lastHeartbeat: null,
  firmware: "0.1.0-sim",
  sensors: { gas: true, tempHum: true, accel: true, pressure: i === 0 },
  lastReading: null,
}));
