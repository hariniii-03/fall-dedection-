/**
 * MineSafe AI safety engine.
 *
 * Pipeline for every incoming helmet sample:
 *   validate -> persist reading -> AI anomaly scoring (modular) ->
 *   deterministic rule evaluation -> duplicate prevention + cooldown ->
 *   alert persistence -> notification fan-out
 *
 * Acknowledged / resolved alerts are NEVER deleted: they are the permanent
 * incident record used by the reports module.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  helmets,
  sensorReadings,
  workers,
  type Alert,
  type Helmet,
  type SensorReading,
  type Worker,
} from "@/db/schema";
import { dispatchAlertNotifications, type DeliveryOutcome } from "@/lib/notifications";
import { logEvent } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import {
  RollingZScoreDetector,
  describeAnomaly,
  type AnomalyResult,
} from "@/lib/safety/anomaly";
import { analyseFallSequence, evaluateRules } from "@/lib/safety/rules";
import {
  magnitudeG,
  type DetectionCandidate,
  type Severity,
} from "@/lib/safety/types";
import type { SensorPayload } from "@/lib/validation";

export type HelmetConnectionState = "online" | "stale" | "offline";

export function connectionStateFor(lastReadingAt: Date | null, timeoutSeconds: number): HelmetConnectionState {
  if (!lastReadingAt) return "offline";
  const age = Date.now() - lastReadingAt.getTime();
  if (age > timeoutSeconds * 1000) return "offline";
  if (age > (timeoutSeconds * 1000) / 2) return "stale";
  return "online";
}

export type IngestResult = {
  readingId: number;
  helmetCode: string;
  workerCode: string | null;
  connectionState: HelmetConnectionState;
  anomaly: AnomalyResult | null;
  anomalyNote: string;
  fallAnalysis: ReturnType<typeof analyseFallSequence> | null;
  alertsRaised: { alertId: number; ruleId: string; severity: Severity; suppressed: boolean }[];
  notifications: DeliveryOutcome[];
};

async function ensureHelmet(code: string): Promise<Helmet> {
  const found = await db.select().from(helmets).where(eq(helmets.code, code));
  if (found[0]) return found[0];
  if (process.env.AUTO_REGISTER_HELMETS === "false") {
    throw new EngineError(`Helmet ${code} is not registered`, 404);
  }
  const created = await db
    .insert(helmets)
    .values({ code, dataSource: "device" })
    .onConflictDoNothing()
    .returning();
  if (created[0]) return created[0];
  const again = await db.select().from(helmets).where(eq(helmets.code, code));
  if (!again[0]) throw new EngineError(`Helmet ${code} could not be registered`, 500);
  return again[0];
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

async function recentHistory(helmetId: number, window: number): Promise<number[][]> {
  const rows = await db
    .select({
      gasRaw: sensorReadings.gasRaw,
      temperatureC: sensorReadings.temperatureC,
      humidityPercent: sensorReadings.humidityPercent,
      accelMagnitudeG: sensorReadings.accelMagnitudeG,
    })
    .from(sensorReadings)
    .where(eq(sensorReadings.helmetId, helmetId))
    .orderBy(desc(sensorReadings.receivedAt))
    .limit(window);
  return rows
    .map((r) => [r.gasRaw, r.temperatureC, r.humidityPercent, r.accelMagnitudeG])
    .map((row) => row.map((v) => (typeof v === "number" ? v : Number.NaN)))
    .filter((row) => row.every((v) => Number.isFinite(v)));
}

async function recentAccelSeries(helmetId: number, limit = 8) {
  const rows = await db
    .select({ mag: sensorReadings.accelMagnitudeG, receivedAt: sensorReadings.receivedAt })
    .from(sensorReadings)
    .where(eq(sensorReadings.helmetId, helmetId))
    .orderBy(desc(sensorReadings.receivedAt))
    .limit(limit);
  return rows
    .filter((r): r is { mag: number; receivedAt: Date } => typeof r.mag === "number")
    .reverse()
    .map((r) => ({
      magnitudeG: r.mag,
      offsetMs: Math.max(0, Date.now() - r.receivedAt.getTime()),
    }));
}

/**
 * Persist one validated reading, run detection and raise alerts.
 */
export async function ingestReading(payload: SensorPayload): Promise<IngestResult> {
  const settings = await getSettings();
  const helmet = await ensureHelmet(payload.helmet_id);

  let worker: Worker | null = null;
  if (payload.worker_id) {
    const found = await db.select().from(workers).where(eq(workers.code, payload.worker_id));
    worker = found[0] ?? null;
  }

  // Accelerometer units: firmware normally sends g. If the payload looks like
  // m/s^2 (an axis > 11), convert so fall thresholds stay in g.
  const accelAxes = [payload.accel_x ?? null, payload.accel_y ?? null, payload.accel_z ?? null];
  const accelScale = accelAxes.some((v) => typeof v === "number" && Math.abs(v) > 11)
    ? 1 / 9.81
    : 1;
  const accelMagnitudeRaw = magnitudeG(payload.accel_x ?? null, payload.accel_y ?? null, payload.accel_z ?? null);
  const accelMagnitude =
    accelMagnitudeRaw === null ? null : Number((accelMagnitudeRaw * accelScale).toFixed(4));
  const deviceTimestamp = payload.timestamp ? new Date(payload.timestamp) : null;

  const insertedReading = await db
    .insert(sensorReadings)
    .values({
      helmetId: helmet.id,
      workerId: worker?.id ?? null,
      gasRaw: payload.gas_raw ?? null,
      temperatureC: payload.temperature_c ?? null,
      humidityPercent: payload.humidity_percent ?? null,
      pressureHpa: payload.pressure_hpa ?? null,
      accelX: payload.accel_x ?? null,
      accelY: payload.accel_y ?? null,
      accelZ: payload.accel_z ?? null,
      accelMagnitudeG: accelMagnitude,
      batteryPercent: payload.battery_percent ?? null,
      source: payload.source,
      deviceTimestamp,
    })
    .returning();
  const reading: SensorReading = insertedReading[0];

  // ---- AI / statistical anomaly layer (separate from the rule engine) ----
  let anomaly: AnomalyResult | null = null;
  if (settings.anomalyEnabled) {
    const history = await recentHistory(helmet.id, settings.anomalyWindow);
    const detector = new RollingZScoreDetector(settings.anomalySensitivity, Math.min(12, settings.anomalyWindow));
    anomaly = detector.detect(
      {
        gasRaw: payload.gas_raw ?? null,
        temperatureC: payload.temperature_c ?? null,
        humidityPercent: payload.humidity_percent ?? null,
        accelMagnitudeG: accelMagnitude,
      },
      history,
    );
    if (anomaly) {
      await db
        .update(sensorReadings)
        .set({
          anomalyScore: Number.isFinite(anomaly.score) ? anomaly.score : null,
          anomalyLabel: anomaly.label,
        })
        .where(eq(sensorReadings.id, reading.id));
    }
  }

  // ---- Deterministic rules ----
  const candidates = evaluateRules(
    {
      gasRaw: payload.gas_raw ?? null,
      temperatureC: payload.temperature_c ?? null,
      humidityPercent: payload.humidity_percent ?? null,
      accelX: payload.accel_x ?? null,
      accelY: payload.accel_y ?? null,
      accelZ: payload.accel_z ?? null,
      accelMagnitudeG: accelMagnitude,
      batteryPercent: payload.battery_percent ?? null,
      sensors: helmet.sensors,
    },
    {
      helmetCode: helmet.code,
      workerCode: worker?.code ?? payload.worker_id ?? null,
      workerName: worker?.fullName ?? null,
      zone: worker?.zone ?? null,
      thresholds: settings,
      msSinceLastData: 0,
    },
  );

  // Enrich fall alerts with the accelerometer sequence analysis.
  let fallAnalysis: ReturnType<typeof analyseFallSequence> | null = null;
  if (accelMagnitude !== null && accelMagnitude >= settings.fallImpactG) {
    const series = await recentAccelSeries(helmet.id, 10);
    fallAnalysis = analyseFallSequence({
      samples: series,
      impactG: settings.fallImpactG,
      freeFallG: settings.fallFreeFallG,
      windowMs: settings.fallWindowMs,
    });
    for (const candidate of candidates) {
      if (candidate.type === "fall" && fallAnalysis) {
        candidate.explanation = `${candidate.explanation} Sequence analysis: ${fallAnalysis.reason} (peak ${fallAnalysis.peakG?.toFixed(2)}g, min ${fallAnalysis.minG?.toFixed(2)}g, confidence ${fallAnalysis.confidence}).`;
        candidate.title =
          fallAnalysis.confidence === "low"
            ? "Impact spike detected (possible fall)"
            : candidate.title;
      }
    }
  }

  // Anomaly layer may add an informational candidate (never a false "emergency").
  if (anomaly && anomaly.label === "anomalous") {
    candidates.push({
      dedupeKey: `anomaly:${helmet.code}`,
      type: "anomaly",
      severity: "warning",
      title: "Unusual sensor pattern (AI)",
      message: `WARNING: Unusual sensor pattern for Helmet ${helmet.code}. ${describeAnomaly(anomaly)}`,
      explanation: `${describeAnomaly(anomaly)} Statistical detector only - this is not a prediction of an accident.`,
      ruleId: `ANOMALY_${(anomaly.feature ?? "UNKNOWN").toUpperCase()}`,
      detector: "anomaly",
      measuredValue: anomaly.value,
      threshold: anomaly.baselineMean,
      unit: anomaly.feature === "gasRaw" ? "raw" : null,
    });
  }

  const raised: IngestResult["alertsRaised"] = [];
  let notifications: DeliveryOutcome[] = [];
  for (const candidate of candidates) {
    const outcome = await raiseAlert(candidate, {
      helmet,
      worker,
      payload,
      source: payload.source,
      location: payload.location ?? null,
    });
    if (outcome.alert && outcome.created && notifications.length === 0) {
      notifications = outcome.deliveries;
    } else if (outcome.alert && outcome.created) {
      notifications = [...notifications, ...outcome.deliveries];
    }
    raised.push({
      alertId: outcome.alert?.id ?? 0,
      ruleId: candidate.ruleId,
      severity: candidate.severity,
      suppressed: !outcome.created,
    });
  }

  const state: HelmetConnectionState = "online";
  await db
    .update(helmets)
    .set({
      lastReadingAt: new Date(),
      lastHeartbeatAt: new Date(),
      batteryPercent: payload.battery_percent ?? helmet.batteryPercent,
      connectionState: state,
      dataSource: payload.source,
    })
    .where(eq(helmets.id, helmet.id));

  return {
    readingId: reading.id,
    helmetCode: helmet.code,
    workerCode: worker?.code ?? payload.worker_id ?? null,
    connectionState: state,
    anomaly,
    anomalyNote: anomaly ? describeAnomaly(anomaly) : "Anomaly detection disabled in settings.",
    fallAnalysis,
    alertsRaised: raised,
    notifications,
  };
}

type RaiseContext = {
  helmet: Helmet;
  worker: Worker | null;
  payload: SensorPayload;
  source: string;
  location: string | null;
};

/**
 * Create an alert unless an identical unresolved alert already exists or the
 * alert cooldown for that rule has not elapsed yet (duplicate prevention).
 */
export async function raiseAlert(
  candidate: DetectionCandidate,
  ctx: RaiseContext,
): Promise<{ alert: Alert | null; created: boolean; deliveries: DeliveryOutcome[] }> {
  const settings = await getSettings();
  const cooldownStart = new Date(Date.now() - settings.alertCooldownSeconds * 1000);

  const existing = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.dedupeKey, candidate.dedupeKey),
        gte(alerts.createdAt, cooldownStart),
      ),
    )
    .orderBy(desc(alerts.createdAt))
    .limit(1);

  if (existing[0] && existing[0].status !== "resolved") {
    return { alert: existing[0], created: false, deliveries: [] };
  }

  const inserted = await db
    .insert(alerts)
    .values({
      type: candidate.type,
      severity: candidate.severity,
      status: "active",
      title: candidate.title,
      message: candidate.message,
      explanation: candidate.explanation,
      detector: candidate.detector,
      ruleId: candidate.ruleId,
      helmetId: ctx.helmet.id,
      workerId: ctx.worker?.id ?? null,
      measuredValue: candidate.measuredValue,
      threshold: candidate.threshold,
      unit: candidate.unit,
      location: ctx.location,
      source: ctx.source,
      snapshot: {
        gasRaw: ctx.payload.gas_raw ?? null,
        temperatureC: ctx.payload.temperature_c ?? null,
        humidityPercent: ctx.payload.humidity_percent ?? null,
        pressureHpa: ctx.payload.pressure_hpa ?? null,
        accelX: ctx.payload.accel_x ?? null,
        accelY: ctx.payload.accel_y ?? null,
        accelZ: ctx.payload.accel_z ?? null,
        accelMagnitudeG:
          magnitudeG(ctx.payload.accel_x ?? null, ctx.payload.accel_y ?? null, ctx.payload.accel_z ?? null) ?? null,
        batteryPercent: ctx.payload.battery_percent ?? null,
        lastHeartbeatAt: ctx.helmet.lastHeartbeatAt?.toISOString() ?? null,
        source: ctx.source,
      },
      dedupeKey: candidate.dedupeKey,
    })
    .returning();

  const alert = inserted[0];
  const deliveries = await dispatchAlertNotifications(alert);
  await logEvent("warn", "engine", `Alert raised: ${candidate.ruleId}`, {
    alertId: alert.id,
    helmet: ctx.helmet.code,
    worker: ctx.worker?.code ?? null,
    measured: candidate.measuredValue,
    threshold: candidate.threshold,
  });
  return { alert, created: true, deliveries };
}

/**
 * Offline / stale helmet watchdog. Called by the dashboard, SSE stream and a
 * cron-friendly endpoint. Missing data is NEVER interpreted as safe.
 */
export async function evaluateHelmetConnections(): Promise<{
  checked: number;
  offline: string[];
  stale: string[];
  alertsRaised: number;
}> {
  const settings = await getSettings();
  const rows = await db.select().from(helmets).where(eq(helmets.active, true));
  const offline: string[] = [];
  const stale: string[] = [];
  let raised = 0;

  for (const helmet of rows) {
    const state = connectionStateFor(helmet.lastReadingAt, settings.offlineTimeoutSeconds);
    if (state !== helmet.connectionState) {
      await db.update(helmets).set({ connectionState: state }).where(eq(helmets.id, helmet.id));
    }
    if (state === "offline") offline.push(helmet.code);
    if (state === "stale") stale.push(helmet.code);
    if (state !== "offline") continue;

    const openOffline = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.dedupeKey, `offline:${helmet.code}`),
          inArray(alerts.status, ["active", "acknowledged"]),
        ),
      )
      .limit(1);
    if (openOffline[0]) continue;

    const msSince = helmet.lastReadingAt ? Date.now() - helmet.lastReadingAt.getTime() : null;
    const linked = await db.select().from(workers).where(eq(workers.helmetId, helmet.id)).limit(1);
    const worker = linked[0] ?? null;
    const result = await raiseAlert(
      evaluateRules(
        {},
        {
          helmetCode: helmet.code,
          workerCode: worker?.code ?? null,
          workerName: worker?.fullName ?? null,
          zone: worker?.zone ?? null,
          thresholds: settings,
          msSinceLastData: msSince,
        },
      )[0],
      {
        helmet,
        worker,
        payload: { helmet_id: helmet.code, source: "device" },
        source: helmet.dataSource,
        location: worker?.zone ?? null,
      },
    );
    if (result.created) raised += 1;
  }

  return { checked: rows.length, offline, stale, alertsRaised: raised };
}

/** Manual SOS raised from the worker app (or the helmet's physical button). */
export async function raiseSosAlert(input: {
  workerCode?: string;
  helmetCode?: string;
  location?: string | null;
  note?: string;
  source: "device" | "simulated" | "manual";
}): Promise<{ alert: Alert; deliveries: DeliveryOutcome[] }> {
  const linkedWorkers = input.workerCode
    ? await db.select().from(workers).where(eq(workers.code, input.workerCode))
    : [];
  const worker = linkedWorkers[0] ?? null;
  const helmetRows = input.helmetCode
    ? await db.select().from(helmets).where(eq(helmets.code, input.helmetCode))
    : worker?.helmetId
      ? await db.select().from(helmets).where(eq(helmets.id, worker.helmetId))
      : [];
  const helmet = helmetRows[0] ?? null;
  const who = worker ? `${worker.code} (${worker.fullName})` : (input.workerCode ?? "unknown worker");
  const locationText = input.location ?? worker?.zone ?? "Location source not integrated";

  const inserted = await db
    .insert(alerts)
    .values({
      type: "sos",
      severity: "critical",
      status: "active",
      title: "Emergency SOS triggered",
      message: `EMERGENCY: SOS activated by Worker ${who} at ${new Date().toISOString()}. Verify the worker's condition immediately. Location: ${locationText}.`,
      explanation: `SOS was triggered manually from the ${input.source === "device" ? "helmet button" : "mobile app"}. Location is only shown when a location source is integrated: ${locationText}.`,
      detector: "manual",
      ruleId: "SOS_MANUAL",
      helmetId: helmet?.id ?? null,
      workerId: worker?.id ?? null,
      location: input.location ?? null,
      source: input.source,
      snapshot: {
        batteryPercent: helmet?.batteryPercent ?? null,
        lastHeartbeatAt: helmet?.lastHeartbeatAt?.toISOString() ?? null,
        source: input.source,
        note: input.note ?? null,
      },
      dedupeKey: `sos:${worker?.code ?? input.workerCode ?? helmet?.code ?? "unknown"}:${Date.now()}`,
    })
    .returning();

  const alert = inserted[0];
  const deliveries = await dispatchAlertNotifications(alert);
  await logEvent("error", "engine", `SOS raised for ${who}`, { alertId: alert.id });
  return { alert, deliveries };
}

export async function acknowledgeAlert(id: number, userId: number, note?: string) {
  const rows = await db.select().from(alerts).where(eq(alerts.id, id));
  const alert = rows[0];
  if (!alert) throw new EngineError("Alert not found", 404);
  if (alert.status === "resolved") throw new EngineError("Alert already resolved", 409);
  const updated = await db
    .update(alerts)
    .set({
      status: "acknowledged",
      acknowledgedAt: alert.acknowledgedAt ?? new Date(),
      acknowledgedBy: alert.acknowledgedBy ?? userId,
      acknowledgementNote: note ?? alert.acknowledgementNote ?? "Acknowledged from mobile app",
    })
    .where(eq(alerts.id, id))
    .returning();
  return updated[0];
}

export async function resolveAlert(id: number, userId: number, notes: string) {
  const rows = await db.select().from(alerts).where(eq(alerts.id, id));
  const alert = rows[0];
  if (!alert) throw new EngineError("Alert not found", 404);
  const updated = await db
    .update(alerts)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy: userId,
      resolutionNotes: notes,
      acknowledgedAt: alert.acknowledgedAt ?? new Date(),
      acknowledgedBy: alert.acknowledgedBy ?? userId,
    })
    .where(eq(alerts.id, id))
    .returning();
  return updated[0];
}

export async function countActiveAlerts(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(inArray(alerts.status, ["active", "acknowledged"]));
  return rows[0]?.count ?? 0;
}
