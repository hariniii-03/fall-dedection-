/**
 * Request payload validation schemas (zod).
 * The ESP32-S3 ingestion endpoint rejects malformed payloads with HTTP 422.
 */
import { z } from "zod";

const optionalNumber = (min: number, max: number) =>
  z.number().finite().min(min).max(max).nullable().optional();

export const sensorPayloadSchema = z
  .object({
    helmet_id: z.string().trim().min(1).max(64),
    worker_id: z.string().trim().max(64).nullish(),
    timestamp: z.string().datetime({ offset: true }).nullish(),
    gas_raw: optionalNumber(0, 65535),
    temperature_c: optionalNumber(-40, 150),
    humidity_percent: optionalNumber(0, 100),
    pressure_hpa: optionalNumber(300, 1200),
    accel_x: optionalNumber(-16, 16),
    accel_y: optionalNumber(-16, 16),
    accel_z: optionalNumber(-16, 16),
    battery_percent: optionalNumber(0, 100),
    location: z.string().trim().max(120).nullish(),
    source: z.enum(["device", "simulated"]).default("device"),
  })
  .refine(
    (payload) =>
      [
        payload.gas_raw,
        payload.temperature_c,
        payload.humidity_percent,
        payload.pressure_hpa,
        payload.accel_x,
        payload.accel_y,
        payload.accel_z,
        payload.battery_percent,
      ].some((v) => typeof v === "number"),
    { message: "At least one sensor field is required" },
  );

export type SensorPayload = z.infer<typeof sensorPayloadSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(4).max(128),
  role: z.enum(["worker", "supervisor", "admin"]).optional(),
});

export const workerSchema = z.object({
  code: z.string().trim().min(2).max(32).optional(),
  fullName: z.string().trim().min(2).max(120),
  department: z.string().trim().max(80).optional(),
  zone: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).nullish(),
  shift: z.string().trim().max(40).optional(),
  helmetCode: z.string().trim().max(64).nullish(),
  active: z.boolean().optional(),
});

export const helmetSchema = z.object({
  code: z.string().trim().min(2).max(64),
  firmwareVersion: z.string().trim().max(64).optional(),
  gasSensorModel: z.string().trim().max(64).optional(),
  sensors: z
    .object({
      gas: z.boolean(),
      temperature: z.boolean(),
      humidity: z.boolean(),
      accelerometer: z.boolean(),
      pressure: z.boolean(),
      battery: z.boolean(),
    })
    .partial()
    .optional(),
});

/**
 * Heartbeat body. `helmet_id` is OPTIONAL here because the helmet id is already
 * in the URL path (`/api/helmets/HELMET-001/heartbeat`) — the original firmware
 * shape sent only battery/firmware/rssi, and requiring it in the body made every
 * heartbeat return 422. When both are supplied they must match.
 */
export const heartbeatSchema = z
  .object({
    helmet_id: z.string().trim().min(1).max(64).optional(),
    firmware_version: z.string().trim().max(64).nullish(),
    battery_percent: optionalNumber(0, 100),
    rssi: z.number().int().min(-120).max(0).nullish(),
  })
  .strip();

export const acknowledgeSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const resolveSchema = z.object({
  resolutionNotes: z.string().trim().min(3).max(1000),
});

export const sosSchema = z.object({
  workerCode: z.string().trim().min(1).max(32).optional(),
  helmetCode: z.string().trim().max(64).optional(),
  location: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(500).optional(),
  source: z.enum(["device", "simulated", "manual"]).default("manual"),
});

export const pushTokenSchema = z.object({
  token: z.string().trim().min(8).max(512),
  platform: z.enum(["android", "ios", "web"]).default("android"),
});

export const thresholdsUpdateSchema = z.object({
  gasWarning: z.number().finite().min(50).max(5000).optional(),
  gasCritical: z.number().finite().min(100).max(6000).optional(),
  gasUnit: z.string().trim().max(48).optional(),
  temperatureWarning: z.number().finite().min(20).max(80).optional(),
  temperatureCritical: z.number().finite().min(25).max(120).optional(),
  humidityWarning: z.number().finite().min(40).max(100).optional(),
  batteryLow: z.number().finite().min(5).max(60).optional(),
  offlineTimeoutSeconds: z.number().int().min(15).max(3600).optional(),
  fallImpactG: z.number().finite().min(1.2).max(8).optional(),
  fallFreeFallG: z.number().finite().min(0.05).max(1).optional(),
  fallWindowMs: z.number().int().min(200).max(5000).optional(),
  anomalyEnabled: z.boolean().optional(),
  anomalySensitivity: z.number().finite().min(1.5).max(6).optional(),
  anomalyWindow: z.number().int().min(10).max(500).optional(),
  alertCooldownSeconds: z.number().int().min(0).max(3600).optional(),
  soundEnabled: z.boolean().optional(),
  vibrationEnabled: z.boolean().optional(),
  emergencyContacts: z
    .object({
      mineControlRoom: z.string().trim().max(60),
      safetyOfficer: z.string().trim().max(60),
      rescueTeam: z.string().trim().max(60),
    })
    .optional(),
  notificationPrefs: z
    .object({
      push: z.boolean(),
      inApp: z.boolean(),
      criticalOnly: z.boolean(),
    })
    .optional(),
});
