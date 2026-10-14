/**
 * Read layer: shared by server components, REST endpoints and the SSE stream.
 */
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  eventLogs,
  helmets,
  notifications,
  sensorReadings,
  users,
  workers,
  type Alert,
} from "@/db/schema";
import { connectionStateFor, type HelmetConnectionState } from "@/lib/safety/engine";
import { getSettings } from "@/lib/settings";
import { severityRank } from "@/lib/safety/rules";
import type { Severity } from "@/lib/safety/types";

export type LatestReading = {
  gasRaw: number | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  pressureHpa: number | null;
  accelX: number | null;
  accelY: number | null;
  accelZ: number | null;
  accelMagnitudeG: number | null;
  batteryPercent: number | null;
  anomalyScore: number | null;
  anomalyLabel: string | null;
  source: string;
  receivedAt: string | null;
  deviceTimestamp: string | null;
};

export type HelmetView = {
  id: number;
  code: string;
  connectionState: HelmetConnectionState;
  dataSource: string;
  batteryPercent: number | null;
  lastReadingAt: string | null;
  lastHeartbeatAt: string | null;
  firmwareVersion: string | null;
  gasSensorModel: string | null;
  sensors: Record<string, boolean>;
  workerCode: string | null;
  workerName: string | null;
  zone: string | null;
  department: string | null;
  workerStatus: SafetyStatus;
  latest: LatestReading | null;
  activeAlertCount: number;
  safetyStatus: SafetyStatus;
};

export type SafetyStatus = "normal" | "warning" | "critical" | "offline";

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

async function recentReadings(windowMinutes = 60) {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  return db
    .select()
    .from(sensorReadings)
    .where(gte(sensorReadings.receivedAt, since))
    .orderBy(desc(sensorReadings.receivedAt))
    .limit(4000);
}

function toLatestReading(row: typeof sensorReadings.$inferSelect): LatestReading {
  return {
    gasRaw: row.gasRaw,
    temperatureC: row.temperatureC,
    humidityPercent: row.humidityPercent,
    pressureHpa: row.pressureHpa,
    accelX: row.accelX,
    accelY: row.accelY,
    accelZ: row.accelZ,
    accelMagnitudeG: row.accelMagnitudeG,
    batteryPercent: row.batteryPercent,
    anomalyScore: row.anomalyScore,
    anomalyLabel: row.anomalyLabel,
    source: row.source,
    receivedAt: iso(row.receivedAt),
    deviceTimestamp: iso(row.deviceTimestamp),
  };
}

function statusFor(
  reading: LatestReading | null,
  state: HelmetConnectionState,
  activeAlerts: Alert[],
): SafetyStatus {
  if (!reading || state === "offline") return "offline";
  if (activeAlerts.some((a) => a.severity === "critical")) return "critical";
  if (activeAlerts.some((a) => a.severity === "warning")) return "warning";
  return "normal";
}

export async function getHelmetViews(): Promise<HelmetView[]> {
  const settings = await getSettings();
  const [helmetRows, workerRows, readings, activeAlerts] = await Promise.all([
    db.select().from(helmets).orderBy(helmets.id),
    db.select().from(workers).orderBy(workers.code),
    recentReadings(30),
    db
      .select()
      .from(alerts)
      .where(inArray(alerts.status, ["active", "acknowledged"]))
      .orderBy(desc(alerts.createdAt))
      .limit(400),
  ]);

  const byHelmet = new Map<number, typeof sensorReadings.$inferSelect>();
  for (const reading of readings) {
    if (!byHelmet.has(reading.helmetId)) byHelmet.set(reading.helmetId, reading);
  }

  return helmetRows.map((helmet) => {
    const state = connectionStateFor(helmet.lastReadingAt, settings.offlineTimeoutSeconds);
    const readingRow = byHelmet.get(helmet.id) ?? null;
    const latest = readingRow ? toLatestReading(readingRow) : null;
    const worker = workerRows.find((w) => w.helmetId === helmet.id) ?? null;
    const helmetAlerts = activeAlerts.filter((a) => a.helmetId === helmet.id);
    return {
      id: helmet.id,
      code: helmet.code,
      connectionState: state,
      dataSource: helmet.dataSource,
      batteryPercent: helmet.batteryPercent ?? latest?.batteryPercent ?? null,
      lastReadingAt: iso(helmet.lastReadingAt),
      lastHeartbeatAt: iso(helmet.lastHeartbeatAt),
      firmwareVersion: helmet.firmwareVersion,
      gasSensorModel: helmet.gasSensorModel,
      sensors: helmet.sensors as unknown as Record<string, boolean>,
      workerCode: worker?.code ?? null,
      workerName: worker?.fullName ?? null,
      zone: worker?.zone ?? null,
      department: worker?.department ?? null,
      workerStatus: statusFor(latest, state, helmetAlerts),
      latest,
      activeAlertCount: helmetAlerts.length,
      safetyStatus: statusFor(latest, state, helmetAlerts),
    };
  });
}

export type DashboardSnapshot = {
  generatedAt: string;
  simulatorEnabled: boolean;
  thresholds: Awaited<ReturnType<typeof getSettings>>;
  totals: {
    workers: number;
    monitored: number;
    safe: number;
    warning: number;
    critical: number;
    offline: number;
    offlineHelmets: number;
    activeAlerts: number;
    criticalAlerts: number;
    unreadNotifications: number;
  };
  hazard: { level: SafetyStatus; label: string; reasons: string[] };
  helmets: HelmetView[];
  latestAlerts: {
    id: number;
    type: string;
    severity: Severity;
    status: string;
    title: string;
    message: string;
    workerCode: string | null;
    helmetCode: string | null;
    createdAt: string | null;
  }[];
  incidents: {
    id: number;
    title: string;
    status: string;
    severity: Severity;
    resolvedAt: string | null;
    resolutionNotes: string | null;
  }[];
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const settings = await getSettings();
  const helmetViews = await getHelmetViews();
  const workerRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workers)
    .where(eq(workers.active, true));

  const alertRows = await db
    .select()
    .from(alerts)
    .orderBy(desc(alerts.createdAt))
    .limit(120);

  const openAlerts = alertRows.filter((a) => a.status !== "resolved");
  const critical = openAlerts.filter((a) => a.severity === "critical");
  const warning = openAlerts.filter((a) => a.severity === "warning");
  const offlineHelmets = helmetViews.filter((h) => h.connectionState === "offline");

  const alertViews = await listAlerts({ limit: 60 });
  const reasons: string[] = [];
  for (const alert of alertViews.filter((a) => a.status !== "resolved" && a.severity === "critical").slice(0, 3)) {
    reasons.push(`${alert.title}${alert.workerCode ? ` · ${alert.workerCode}` : ""}`);
  }
  if (offlineHelmets.length) {
    reasons.push(`${offlineHelmets.length} helmet(s) offline: ${offlineHelmets.map((h) => h.code).join(", ")}`);
  }
  for (const alert of warning.slice(0, 2)) reasons.push(alert.title);

  const hazardLevel: SafetyStatus = critical.length
    ? "critical"
    : warning.length || offlineHelmets.length
      ? "warning"
      : "normal";

  const monitored = helmetViews.filter((h) => h.connectionState !== "offline").length;
  const safe = helmetViews.filter((h) => h.safetyStatus === "normal").length;
  const helmetCritical = helmetViews.filter((h) => h.safetyStatus === "critical").length;
  const helmetWarning = helmetViews.filter((h) => h.safetyStatus === "warning").length;

  return {
    generatedAt: new Date().toISOString(),
    simulatorEnabled: await import("@/lib/simulator").then((m) => m.isSimulatorEnabled()),
    thresholds: settings,
    totals: {
      workers: workerRows[0]?.count ?? 0,
      monitored,
      safe,
      warning: helmetWarning,
      critical: helmetCritical,
      offline: helmetViews.length - monitored,
      offlineHelmets: offlineHelmets.length,
      activeAlerts: openAlerts.length,
      criticalAlerts: critical.length,
      unreadNotifications: 0,
    },
    hazard: {
      level: hazardLevel,
      label:
        hazardLevel === "critical"
          ? "CRITICAL - immediate action required"
          : hazardLevel === "warning"
            ? "WARNING - degraded conditions"
            : "NORMAL - all monitored helmets within limits",
      reasons: reasons.slice(0, 5),
    },
    helmets: helmetViews,
    latestAlerts: alertViews.slice(0, 8).map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      status: a.status,
      title: a.title,
      message: a.message,
      workerCode: a.workerCode,
      helmetCode: a.helmetCode,
      createdAt: a.createdAt,
    })),
    incidents: alertViews
      .filter((a) => a.status === "resolved" || a.status === "acknowledged")
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        severity: a.severity,
        resolvedAt: a.resolvedAt,
        resolutionNotes: a.resolutionNotes,
      })),
  };
}

export type AlertFilter = {
  status?: "active" | "acknowledged" | "resolved" | "all";
  severity?: Severity | "all";
  type?: string;
  search?: string;
  limit?: number;
};

export type AlertView = {
  id: number;
  type: string;
  severity: Severity;
  status: string;
  title: string;
  message: string;
  explanation: string | null;
  detector: string;
  ruleId: string | null;
  measuredValue: number | null;
  threshold: number | null;
  unit: string | null;
  location: string | null;
  source: string;
  snapshot: Record<string, unknown> | null;
  helmetCode: string | null;
  workerCode: string | null;
  workerName: string | null;
  zone: string | null;
  createdAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  acknowledgementNote: string | null;
  resolutionNotes: string | null;
  ackSeconds: number | null;
  resolveSeconds: number | null;
};

export async function listAlerts(filter: AlertFilter = {}): Promise<AlertView[]> {
  const conditions = [];
  if (filter.status && filter.status !== "all") conditions.push(eq(alerts.status, filter.status));
  if (filter.severity && filter.severity !== "all") conditions.push(eq(alerts.severity, filter.severity));
  if (filter.type && filter.type !== "all") conditions.push(eq(alerts.type, filter.type));
  if (filter.search) {
    const term = `%${filter.search}%`;
    conditions.push(
      or(
        ilike(alerts.title, term),
        ilike(alerts.message, term),
        ilike(alerts.ruleId, term),
        ilike(workers.code, term),
        ilike(workers.fullName, term),
        ilike(helmets.code, term),
      )!,
    );
  }

  const rows = await db
    .select({
      alert: alerts,
      helmetCode: helmets.code,
      workerCode: workers.code,
      workerName: workers.fullName,
      zone: workers.zone,
    })
    .from(alerts)
    .leftJoin(helmets, eq(alerts.helmetId, helmets.id))
    .leftJoin(workers, eq(alerts.workerId, workers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(alerts.createdAt))
    .limit(filter.limit ?? 100);

  return rows.map(({ alert, helmetCode, workerCode, workerName, zone }) => ({
    id: alert.id,
    type: alert.type,
    severity: alert.severity as Severity,
    status: alert.status,
    title: alert.title,
    message: alert.message,
    explanation: alert.explanation,
    detector: alert.detector,
    ruleId: alert.ruleId,
    measuredValue: alert.measuredValue,
    threshold: alert.threshold,
    unit: alert.unit,
    location: alert.location,
    source: alert.source,
    snapshot: (alert.snapshot as Record<string, unknown> | null) ?? null,
    helmetCode,
    workerCode,
    workerName,
    zone,
    createdAt: iso(alert.createdAt),
    acknowledgedAt: iso(alert.acknowledgedAt),
    resolvedAt: iso(alert.resolvedAt),
    acknowledgementNote: alert.acknowledgementNote,
    resolutionNotes: alert.resolutionNotes,
    ackSeconds:
      alert.acknowledgedAt && alert.createdAt
        ? Math.round((alert.acknowledgedAt.getTime() - alert.createdAt.getTime()) / 1000)
        : null,
    resolveSeconds:
      alert.resolvedAt && alert.createdAt
        ? Math.round((alert.resolvedAt.getTime() - alert.createdAt.getTime()) / 1000)
        : null,
  }));
}

export async function getAlertDetail(id: number): Promise<AlertView | null> {
  const rows = await listAlerts({ limit: 1000 });
  return rows.find((r) => r.id === id) ?? null;
}

export type WorkerView = {
  id: number;
  code: string;
  fullName: string;
  department: string | null;
  zone: string | null;
  shift: string | null;
  phone: string | null;
  active: boolean;
  helmetCode: string | null;
  connectionState: HelmetConnectionState;
  safetyStatus: SafetyStatus;
  lastReadingAt: string | null;
  batteryPercent: number | null;
  recentAlerts: { id: number; title: string; severity: Severity; createdAt: string | null; status: string }[];
};

export async function listWorkersWithStatus(): Promise<WorkerView[]> {
  const [workerRows, helmetViews, alertRows] = await Promise.all([
    db.select().from(workers).orderBy(workers.code),
    getHelmetViews(),
    db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(120),
  ]);

  return workerRows.map((worker) => {
    const helmet = helmetViews.find((h) => h.id === worker.helmetId) ?? null;
    const recent = alertRows
      .filter((a) => a.workerId === worker.id)
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.severity as Severity,
        createdAt: iso(a.createdAt),
        status: a.status,
      }));
    return {
      id: worker.id,
      code: worker.code,
      fullName: worker.fullName,
      department: worker.department,
      zone: worker.zone,
      shift: worker.shift,
      phone: worker.phone,
      active: worker.active,
      helmetCode: helmet?.code ?? null,
      connectionState: helmet?.connectionState ?? "offline",
      safetyStatus: helmet?.safetyStatus ?? "offline",
      lastReadingAt: helmet?.lastReadingAt ?? null,
      batteryPercent: helmet?.batteryPercent ?? null,
      recentAlerts: recent,
    };
  });
}

export async function getWorkerDetail(code: string) {
  const all = await listWorkersWithStatus();
  const worker = all.find((w) => w.code.toLowerCase() === code.toLowerCase());
  if (!worker) return null;
  const helmetViews = await getHelmetViews();
  const helmet = helmetViews.find((h) => h.code === worker.helmetCode) ?? null;
  const history = helmet
    ? await db
        .select()
        .from(sensorReadings)
        .where(eq(sensorReadings.helmetId, helmet.id))
        .orderBy(desc(sensorReadings.receivedAt))
        .limit(60)
    : [];
  const workerAlerts = await listAlerts({ limit: 200 });
  return {
    worker,
    helmet,
    history: history.reverse().map(toLatestReading),
    alerts: workerAlerts.filter((a) => a.workerCode === worker.code).slice(0, 20),
  };
}

export type ReportSummary = {
  from: string;
  to: string;
  totals: {
    alerts: number;
    gasAlerts: number;
    fallAlerts: number;
    temperatureAlerts: number;
    batteryAlerts: number;
    offlineAlerts: number;
    sosAlerts: number;
    anomalyAlerts: number;
    critical: number;
    warning: number;
    acknowledged: number;
    resolved: number;
  };
  averages: {
    gasRaw: number | null;
    temperatureC: number | null;
    humidityPercent: number | null;
    accelMagnitudeG: number | null;
  };
  peak: { gasRaw: number | null; temperatureC: number | null; accelMagnitudeG: number | null };
  ackSeconds: { average: number | null; fastest: number | null; slowest: number | null };
  resolveSeconds: { average: number | null; fastest: number | null; slowest: number | null };
  byDay: { day: string; total: number; critical: number }[];
  readingsIngested: number;
  deviceReadings: number;
  simulatedReadings: number;
};

export async function getReportSummary(fromIso: string, toIso: string): Promise<ReportSummary> {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const alertRows = await db
    .select()
    .from(alerts)
    .where(and(gte(alerts.createdAt, from), lte(alerts.createdAt, to)))
    .orderBy(desc(alerts.createdAt))
    .limit(5000);

  const readingRows = await db
    .select()
    .from(sensorReadings)
    .where(and(gte(sensorReadings.receivedAt, from), lte(sensorReadings.receivedAt, to)))
    .limit(20000);

  const count = (type: string) => alertRows.filter((a) => a.type === type).length;
  const acks = alertRows
    .filter((a) => a.acknowledgedAt)
    .map((a) => (a.acknowledgedAt!.getTime() - a.createdAt.getTime()) / 1000)
    .filter((s) => s >= 0);
  const res = alertRows
    .filter((a) => a.resolvedAt)
    .map((a) => (a.resolvedAt!.getTime() - a.createdAt.getTime()) / 1000)
    .filter((s) => s >= 0);

  const avg = (values: number[]) =>
    values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null;
  const pick = (key: keyof typeof sensorReadings.$inferSelect) =>
    readingRows.map((r) => r[key]).filter((v): v is number => typeof v === "number");

  const dayMap = new Map<string, { total: number; critical: number }>();
  for (const alert of alertRows) {
    const day = alert.createdAt.toISOString().slice(0, 10);
    const entry = dayMap.get(day) ?? { total: 0, critical: 0 };
    entry.total += 1;
    if (alert.severity === "critical") entry.critical += 1;
    dayMap.set(day, entry);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totals: {
      alerts: alertRows.length,
      gasAlerts: count("gas"),
      fallAlerts: count("fall"),
      temperatureAlerts: count("temperature"),
      batteryAlerts: count("battery"),
      offlineAlerts: count("offline"),
      sosAlerts: count("sos"),
      anomalyAlerts: count("anomaly"),
      critical: alertRows.filter((a) => a.severity === "critical").length,
      warning: alertRows.filter((a) => a.severity === "warning").length,
      acknowledged: alertRows.filter((a) => a.status !== "active").length,
      resolved: alertRows.filter((a) => a.status === "resolved").length,
    },
    averages: {
      gasRaw: avg(pick("gasRaw")),
      temperatureC: avg(pick("temperatureC")),
      humidityPercent: avg(pick("humidityPercent")),
      accelMagnitudeG: avg(pick("accelMagnitudeG")),
    },
    peak: {
      gasRaw: pick("gasRaw").length ? Math.max(...pick("gasRaw")) : null,
      temperatureC: pick("temperatureC").length ? Math.max(...pick("temperatureC")) : null,
      accelMagnitudeG: pick("accelMagnitudeG").length ? Math.max(...pick("accelMagnitudeG")) : null,
    },
    ackSeconds: {
      average: avg(acks.map((s) => Number(s.toFixed(1)))),
      fastest: acks.length ? Number(Math.min(...acks).toFixed(1)) : null,
      slowest: acks.length ? Number(Math.max(...acks).toFixed(1)) : null,
    },
    resolveSeconds: {
      average: avg(res.map((s) => Number(s.toFixed(1)))),
      fastest: res.length ? Number(Math.min(...res).toFixed(1)) : null,
      slowest: res.length ? Number(Math.max(...res).toFixed(1)) : null,
    },
    byDay: [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, total: v.total, critical: v.critical })),
    readingsIngested: readingRows.length,
    deviceReadings: readingRows.filter((r) => r.source === "device").length,
    simulatedReadings: readingRows.filter((r) => r.source === "simulated").length,
  };
}

export async function getReadingSeries(helmetCode: string, limit = 60) {
  const helmet = (await db.select().from(helmets).where(eq(helmets.code, helmetCode)))[0];
  if (!helmet) return null;
  const rows = await db
    .select()
    .from(sensorReadings)
    .where(eq(sensorReadings.helmetId, helmet.id))
    .orderBy(desc(sensorReadings.receivedAt))
    .limit(limit);
  return {
    helmetCode,
    series: rows
      .reverse()
      .map((r) => ({
        t: iso(r.receivedAt)!,
        gasRaw: r.gasRaw,
        temperatureC: r.temperatureC,
        humidityPercent: r.humidityPercent,
        accelMagnitudeG: r.accelMagnitudeG,
        batteryPercent: r.batteryPercent,
        anomalyLabel: r.anomalyLabel,
        source: r.source,
      })),
  };
}

export async function listNotifications(userId: number) {
  const rows = await db
    .select({
      id: notifications.id,
      alertId: notifications.alertId,
      title: notifications.title,
      body: notifications.body,
      priority: notifications.priority,
      channel: notifications.channel,
      deliveryStatus: notifications.deliveryStatus,
      deliveryDetail: notifications.deliveryDetail,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      alertStatus: alerts.status,
      alertSeverity: alerts.severity,
    })
    .from(notifications)
    .leftJoin(alerts, eq(notifications.alertId, alerts.id))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(120);
  return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt), readAt: iso(r.readAt) }));
}

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`read_at is null`));
  return rows[0]?.count ?? 0;
}

export async function listEventLogs(limit = 40) {
  const rows = await db.select().from(eventLogs).orderBy(desc(eventLogs.createdAt)).limit(limit);
  return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) }));
}

export async function listSupervisors() {
  return db
    .select({ id: users.id, fullName: users.fullName, role: users.role })
    .from(users)
    .where(inArray(users.role, ["supervisor", "admin"]));
}

export function worstSeverity(severities: Severity[]): Severity {
  return severities.reduce<Severity>(
    (worst, current) => (severityRank(current) > severityRank(worst) ? current : worst),
    "info",
  );
}
