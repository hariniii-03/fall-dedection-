/**
 * Idempotent demo/development seed.
 *
 * Everything created here is clearly labelled `simulated` in the database so
 * the UI can distinguish SIMULATED data from real ESP32-S3 telemetry.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  helmets,
  sensorReadings,
  systemState,
  users,
  workers,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_THRESHOLDS } from "@/lib/safety/types";
import { thresholdConfigs } from "@/db/schema";

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

const HELMET_SEED = [
  { code: "HELMET-001", zone: "Zone-A", pressure: false },
  { code: "HELMET-002", zone: "Zone-B", pressure: true },
  { code: "HELMET-003", zone: "Zone-C", pressure: false },
  { code: "HELMET-004", zone: "Zone-D", pressure: false },
];

const WORKER_SEED = [
  { code: "WORKER-001", fullName: "Ravi Kumar", department: "Drilling", zone: "Zone-A", helmet: "HELMET-001", shift: "Day" },
  { code: "WORKER-002", fullName: "Amit Sharma", department: "Haulage", zone: "Zone-B", helmet: "HELMET-002", shift: "Day" },
  { code: "WORKER-003", fullName: "Suresh Nair", department: "Blasting", zone: "Zone-C", helmet: "HELMET-003", shift: "Night" },
  { code: "WORKER-004", fullName: "Deepak Verma", department: "Ventilation", zone: "Zone-D", helmet: "HELMET-004", shift: "Night" },
];

const USER_SEED = [
  {
    username: "admin",
    password: "Admin@123",
    role: "admin" as const,
    fullName: "Mine Safety Administrator",
    email: "admin@minesafe.local",
    phone: "+91-90000-00001",
    workerCode: null,
  },
  {
    username: "supervisor",
    password: "Super@123",
    role: "supervisor" as const,
    fullName: "Priya Menon (Shift Supervisor)",
    email: "supervisor@minesafe.local",
    phone: "+91-90000-00002",
    workerCode: null,
  },
  {
    username: "worker",
    password: "Worker@123",
    role: "worker" as const,
    fullName: "Ravi Kumar",
    email: "worker@minesafe.local",
    phone: "+91-90000-00003",
    workerCode: "WORKER-001",
  },
];

async function seed(): Promise<void> {
  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if ((existing[0]?.count ?? 0) > 0) return;

  await db
    .insert(thresholdConfigs)
    .values({ scope: "global", ...DEFAULT_THRESHOLDS })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values(
      USER_SEED.map((u) => ({
        username: u.username,
        passwordHash: hashPassword(u.password),
        role: u.role,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        workerCode: u.workerCode,
      })),
    )
    .onConflictDoNothing();

  const helmetRows = await db
    .insert(helmets)
    .values(
      HELMET_SEED.map((h) => ({
        code: h.code,
        sensors: {
          gas: true,
          temperature: true,
          humidity: true,
          accelerometer: true,
          pressure: h.pressure,
          battery: true,
        },
        gasSensorModel: "MQ-135",
        firmwareVersion: "esp32-s3-1.0.0",
        dataSource: "simulated",
      })),
    )
    .onConflictDoNothing()
    .returning();

  const workerRows = await db
    .insert(workers)
    .values(
      WORKER_SEED.map((w) => ({
        code: w.code,
        fullName: w.fullName,
        department: w.department,
        zone: w.zone,
        shift: w.shift,
        helmetId: helmetRows.find((h) => h.code === w.helmet)?.id ?? null,
        phone: "+91-90000-0000" + (WORKER_SEED.indexOf(w) + 1),
      })),
    )
    .onConflictDoNothing()
    .returning();

  // ---- historical simulated telemetry (last 45 minutes, 1 sample / 90s) ----
  const history: (typeof sensorReadings.$inferInsert)[] = [];
  const now = Date.now();
  const samples = 30;
  for (const helmet of helmetRows) {
    const worker = workerRows.find((w) => w.helmetId === helmet.id) ?? null;
    for (let i = samples; i > 0; i -= 1) {
      const t = new Date(now - i * 90_000);
      const wave = Math.sin((i / samples) * Math.PI * 2);
      history.push({
        helmetId: helmet.id,
        workerId: worker?.id ?? null,
        gasRaw: 640 + wave * 60 + helmet.id * 15,
        temperatureC: 31 + wave * 1.2 + helmet.id * 0.2,
        humidityPercent: 64 + wave * 5,
        pressureHpa: helmet.sensors.pressure ? 1012 + wave * 3 : null,
        accelX: 0.12 + wave * 0.03,
        accelY: 0.18 - wave * 0.02,
        accelZ: 0.98 + wave * 0.01,
        accelMagnitudeG: 1.0 + wave * 0.03,
        batteryPercent: Math.max(15, 88 - helmet.id * 6 - (samples - i) * 0.05),
        anomalyScore: 0.05,
        anomalyLabel: "normal",
        source: "simulated",
        deviceTimestamp: t,
        receivedAt: t,
      });
    }
  }
  if (history.length) await db.insert(sensorReadings).values(history);

  // HELMET-004 is intentionally left with stale telemetry so the offline
  // watchdog, the offline alert rule and the "stale data" UI state can be
  // demonstrated without hardware.
  const offlineHelmet = helmetRows.find((h) => h.code === "HELMET-004");
  if (offlineHelmet) {
    await db
      .update(helmets)
      .set({
        lastReadingAt: new Date(now - 30 * 60_000),
        lastHeartbeatAt: new Date(now - 30 * 60_000),
        connectionState: "offline",
        batteryPercent: 21,
      })
      .where(sql`${helmets.id} = ${offlineHelmet.id}`);
  }

  for (const helmet of helmetRows.filter((h) => h.code !== "HELMET-004")) {
    const worker = workerRows.find((w) => w.helmetId === helmet.id) ?? null;
    await db
      .update(helmets)
      .set({
        lastReadingAt: new Date(now - 5_000),
        lastHeartbeatAt: new Date(now - 5_000),
        connectionState: "online",
        batteryPercent: Math.max(25, 92 - helmet.id * 8),
      })
      .where(sql`${helmets.id} = ${helmet.id}`);
    void worker;
  }

  // ---- a resolved historical incident so reports/history are not empty ----
  const historicalWorker = workerRows.find((w) => w.code === "WORKER-002");
  await db
    .insert(alerts)
    .values({
      type: "gas",
      severity: "warning",
      status: "resolved",
      title: "Air quality warning",
      message:
        "WARNING: Air-quality reading for Worker WORKER-002 (Amit Sharma) is above the warning threshold. Improve ventilation and keep monitoring.",
      explanation:
        "MQ-135 raw reading 942 exceeded the warning threshold 900 (MQ-135 raw ADC). Simulated test data - not a calibrated gas concentration.",
      detector: "rule",
      ruleId: "GAS_WARNING",
      helmetId: helmetRows.find((h) => h.code === "HELMET-002")?.id ?? null,
      workerId: historicalWorker?.id ?? null,
      measuredValue: 942,
      threshold: 900,
      unit: "raw",
      source: "simulated",
      snapshot: { source: "simulated", gasRaw: 942 },
      dedupeKey: "gas:HELMET-002:warning:seed",
      acknowledgedAt: new Date(now - 40 * 60_000),
      resolvedAt: new Date(now - 32 * 60_000),
      resolutionNotes: "Ventilation increased, readings returned to normal. (Seeded demo record)",
    })
    .onConflictDoNothing();

  await db
    .insert(systemState)
    .values({ key: "simulator", value: { enabled: true, lastTickAt: null } })
    .onConflictDoNothing();
}
