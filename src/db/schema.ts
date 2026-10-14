/**
 * MineSafe AI - Database schema (PostgreSQL via Drizzle ORM)
 *
 * Tables: users, helmets, workers, sensor_readings, alerts, notifications,
 *         push_tokens, threshold_configs, event_logs
 *
 * Every sensor reading and alert is persisted so the incident history is
 * never lost (acknowledged/resolved alerts are kept forever).
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type SensorAvailability = {
  gas: boolean;
  temperature: boolean;
  humidity: boolean;
  accelerometer: boolean;
  pressure: boolean;
  battery: boolean;
};

export type EmergencyContacts = {
  mineControlRoom: string;
  safetyOfficer: string;
  rescueTeam: string;
};

export type NotificationPrefs = {
  push: boolean;
  inApp: boolean;
  criticalOnly: boolean;
};

export type AlertSnapshot = {
  gasRaw?: number | null;
  temperatureC?: number | null;
  humidityPercent?: number | null;
  pressureHpa?: number | null;
  accelX?: number | null;
  accelY?: number | null;
  accelZ?: number | null;
  accelMagnitudeG?: number | null;
  batteryPercent?: number | null;
  lastHeartbeatAt?: string | null;
  source?: string;
  [key: string]: unknown;
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("worker"), // worker | supervisor | admin
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  workerCode: text("worker_code"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const helmets = pgTable("helmets", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // HELMET-001
  firmwareVersion: text("firmware_version").default("esp32-s3-1.0.0"),
  macAddress: text("mac_address"),
  gasSensorModel: text("gas_sensor_model").default("MQ-135"),
  sensors: jsonb("sensors")
    .$type<SensorAvailability>()
    .notNull()
    .default({
      gas: true,
      temperature: true,
      humidity: true,
      accelerometer: true,
      pressure: false,
      battery: true,
    }),
  batteryPercent: real("battery_percent"),
  connectionState: text("connection_state").notNull().default("offline"), // online | stale | offline
  dataSource: text("data_source").notNull().default("simulated"), // device | simulated
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  lastReadingAt: timestamp("last_reading_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workers = pgTable(
  "workers",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(), // WORKER-001
    fullName: text("full_name").notNull(),
    department: text("department").default("General"),
    zone: text("zone").default("Zone-A"),
    phone: text("phone"),
    helmetId: integer("helmet_id").references(() => helmets.id, { onDelete: "set null" }),
    shift: text("shift").default("Day"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("workers_helmet_idx").on(table.helmetId)],
);

export const sensorReadings = pgTable(
  "sensor_readings",
  {
    id: serial("id").primaryKey(),
    helmetId: integer("helmet_id")
      .notNull()
      .references(() => helmets.id, { onDelete: "cascade" }),
    workerId: integer("worker_id").references(() => workers.id, { onDelete: "set null" }),
    gasRaw: real("gas_raw"),
    temperatureC: real("temperature_c"),
    humidityPercent: real("humidity_percent"),
    pressureHpa: real("pressure_hpa"),
    accelX: real("accel_x"),
    accelY: real("accel_y"),
    accelZ: real("accel_z"),
    accelMagnitudeG: real("accel_magnitude_g"),
    batteryPercent: real("battery_percent"),
    anomalyScore: real("anomaly_score"),
    anomalyLabel: text("anomaly_label"),
    source: text("source").notNull().default("simulated"), // device | simulated
    deviceTimestamp: timestamp("device_timestamp", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("readings_helmet_time_idx").on(table.helmetId, table.receivedAt),
    index("readings_received_idx").on(table.receivedAt),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // gas | fall | temperature | battery | offline | sos | anomaly
    severity: text("severity").notNull().default("warning"), // info | warning | critical
    status: text("status").notNull().default("active"), // active | acknowledged | resolved
    title: text("title").notNull(),
    message: text("message").notNull(),
    explanation: text("explanation"),
    detector: text("detector").notNull().default("rule"), // rule | anomaly | manual
    ruleId: text("rule_id"),
    helmetId: integer("helmet_id").references(() => helmets.id, { onDelete: "set null" }),
    workerId: integer("worker_id").references(() => workers.id, { onDelete: "set null" }),
    measuredValue: real("measured_value"),
    threshold: real("threshold"),
    unit: text("unit"),
    location: text("location"),
    source: text("source").notNull().default("simulated"), // device | simulated | manual
    snapshot: jsonb("snapshot").$type<AlertSnapshot>().default({}),
    dedupeKey: text("dedupe_key"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: integer("acknowledged_by").references(() => users.id, { onDelete: "set null" }),
    acknowledgementNote: text("acknowledgement_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: integer("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("alerts_status_idx").on(table.status),
    index("alerts_created_idx").on(table.createdAt),
    index("alerts_dedupe_idx").on(table.dedupeKey),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    alertId: integer("alert_id").references(() => alerts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    priority: text("priority").notNull().default("warning"), // critical | warning | info
    channel: text("channel").notNull().default("in_app"), // push | in_app | local
    deliveryStatus: text("delivery_status").notNull().default("pending"), // sent | failed | skipped | pending
    deliveryDetail: text("delivery_detail"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_idx").on(table.userId, table.createdAt)],
);

export const pushTokens = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull().default("android"),
  enabled: boolean("enabled").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const thresholdConfigs = pgTable("threshold_configs", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull().default("global"),
  gasWarning: real("gas_warning").notNull().default(900),
  gasCritical: real("gas_critical").notNull().default(1400),
  gasUnit: text("gas_unit").notNull().default("MQ-135 raw ADC"),
  temperatureWarning: real("temperature_warning").notNull().default(38),
  temperatureCritical: real("temperature_critical").notNull().default(43),
  humidityWarning: real("humidity_warning").notNull().default(85),
  batteryLow: real("battery_low").notNull().default(25),
  offlineTimeoutSeconds: integer("offline_timeout_seconds").notNull().default(90),
  fallImpactG: real("fall_impact_g").notNull().default(2.6),
  fallFreeFallG: real("fall_free_fall_g").notNull().default(0.45),
  fallWindowMs: integer("fall_window_ms").notNull().default(1200),
  anomalyEnabled: boolean("anomaly_enabled").notNull().default(true),
  anomalySensitivity: real("anomaly_sensitivity").notNull().default(3),
  anomalyWindow: integer("anomaly_window").notNull().default(40),
  alertCooldownSeconds: integer("alert_cooldown_seconds").notNull().default(120),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  vibrationEnabled: boolean("vibration_enabled").notNull().default(true),
  emergencyContacts: jsonb("emergency_contacts")
    .$type<EmergencyContacts>()
    .notNull()
    .default({ mineControlRoom: "+91-000-000-0000", safetyOfficer: "", rescueTeam: "" }),
  notificationPrefs: jsonb("notification_prefs")
    .$type<NotificationPrefs>()
    .notNull()
    .default({ push: true, inApp: true, criticalOnly: false }),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventLogs = pgTable(
  "event_logs",
  {
    id: serial("id").primaryKey(),
    level: text("level").notNull().default("info"), // info | warn | error
    source: text("source").notNull().default("backend"),
    message: text("message").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("event_logs_created_idx").on(table.createdAt)],
);

/** Small key/value store for runtime switches (e.g. simulated data feed). */
export const systemState = pgTable("system_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Worker = typeof workers.$inferSelect;
export type Helmet = typeof helmets.$inferSelect;
export type SensorReading = typeof sensorReadings.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type ThresholdConfig = typeof thresholdConfigs.$inferSelect;
