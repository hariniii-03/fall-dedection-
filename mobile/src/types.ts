/** Domain types shared by all MineSafe AI screens. */

export type SafetyStatus = "normal" | "warning" | "critical" | "offline";

export interface Reading {
  helmetId: string;
  workerId: string | null;
  ts: string; // ISO 8601
  gasRaw: number | null; // MQ-135 raw ADC value, NOT a calibrated AQI
  temperatureC: number | null;
  humidityPercent: number | null;
  accelX: number | null;
  accelY: number | null;
  accelZ: number | null;
  batteryPercent: number | null;
  pressureHpa: number | null; // only when a pressure sensor is installed
  simulated: boolean; // true => test data, never presented as real
}

export type AlertType = "gas" | "fall" | "temperature" | "battery" | "offline" | "sos";
export type AlertSeverity = "warning" | "critical";
export type AlertState = "active" | "acknowledged" | "resolved";

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  state: AlertState;
  workerId: string | null;
  helmetId: string;
  message: string;
  detail: Record<string, unknown>; // triggering reading values + threshold used
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  read: boolean;
  simulated: boolean;
}

export interface Worker {
  id: string;
  name: string;
  helmetId: string | null;
  zone: string;
  active: boolean;
  status: SafetyStatus;
  lastSeen: string | null;
  recentIncidents: number;
}

export interface Helmet {
  id: string;
  online: boolean;
  batteryPercent: number | null;
  lastHeartbeat: string | null;
  firmware: string | null;
  sensors: { gas: boolean; tempHum: boolean; accel: boolean; pressure: boolean };
  lastReading: Reading | null;
}

export interface Thresholds {
  gasWarning: number;
  gasCritical: number;
  tempWarningC: number;
  tempCriticalC: number;
  lowBatteryPercent: number;
  offlineTimeoutSec: number;
}
