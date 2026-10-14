"use client";

import Link from "next/link";
import { useLive } from "@/components/LiveProvider";
import {
  Card,
  EmptyState,
  Gauge,
  MetricTile,
  Pill,
  SectionTitle,
  SimulatedBadge,
  Sparkline,
  StatusDot,
  formatClock,
  statusTone,
  timeAgo,
} from "@/components/ui";
import type { DashboardSnapshot } from "@/lib/queries";

export function DashboardClient({ initial }: { initial: DashboardSnapshot }) {
  const { snapshot } = useLive();
  const data = snapshot ?? initial;
  const t = data.thresholds;

  const monitored = data.helmets.filter((h) => h.connectionState !== "offline");
  const primary = monitored[0] ?? data.helmets[0] ?? null;
  const latest = primary?.latest ?? null;
  const gasSeries = monitored
    .flatMap((h) => (h.latest?.gasRaw !== null && h.latest?.gasRaw !== undefined ? [h.latest.gasRaw] : []))
    .reverse();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">Safety Dashboard</h1>
          <p className="ms-muted text-[11px]">
            Shift overview · {data.totals.monitored}/{data.helmets.length} helmets reporting
          </p>
        </div>
        <SimulatedBadge source={primary?.latest?.source ?? "simulated"} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <MetricTile label="Registered workers" value={data.totals.workers} tone="info" icon="👷" href="/workers" />
        <MetricTile label="Monitored now" value={data.totals.monitored} tone="info" icon="📶" href="/monitor" />
        <MetricTile label="In safe condition" value={data.totals.safe} tone="normal" icon="✅" href="/workers" />
        <MetricTile
          label="Active alerts"
          value={data.totals.activeAlerts}
          tone={data.totals.criticalAlerts ? "critical" : data.totals.activeAlerts ? "warning" : "normal"}
          icon="🚨"
          hint={`${data.totals.criticalAlerts} critical`}
          href="/alerts"
        />
        <MetricTile
          label="Offline helmets"
          value={data.totals.offlineHelmets}
          tone={data.totals.offlineHelmets ? "offline" : "normal"}
          icon="⛔"
          hint="Missing data ≠ safe"
          href="/helmets"
        />
        <MetricTile
          label="Hazard status"
          value={data.hazard.level.toUpperCase()}
          tone={statusTone(data.hazard.level)}
          icon="☢️"
          hint={data.hazard.reasons[0] ?? "All readings within configured limits"}
        />
      </div>

      <SectionTitle title="Live readings" hint={primary ? `${primary.code} · ${primary.workerName ?? "unassigned"}` : "No helmet registered"} action={<Link className="ms-btn ms-btn-ghost !py-1 !text-[11px]" href="/monitor">Open live monitor</Link>} />
      {primary && latest ? (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StatusDot tone={statusTone(primary.safetyStatus)} pulse={primary.connectionState === "online"} />
              <div>
                <p className="text-xs font-bold">{primary.code}</p>
                <p className="ms-muted text-[10px]">
                  {primary.workerCode ? `${primary.workerCode} · ${primary.zone ?? ""}` : "unassigned"} ·{" "}
                  {timeAgo(latest.receivedAt)}
                </p>
              </div>
            </div>
            <Pill tone={statusTone(primary.safetyStatus)}>{primary.safetyStatus}</Pill>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <Gauge
              label="Air quality (raw)"
              value={latest.gasRaw}
              min={0}
              max={2000}
              threshold={t.gasCritical}
              unit="MQ-135 raw"
              tone={latest.gasRaw === null ? "offline" : latest.gasRaw >= t.gasCritical ? "critical" : latest.gasRaw >= t.gasWarning ? "warning" : "normal"}
              size={124}
            />
            <Gauge
              label="Temperature"
              value={latest.temperatureC}
              min={20}
              max={60}
              threshold={t.temperatureCritical}
              unit="°C"
              tone={
                latest.temperatureC === null
                  ? "offline"
                  : latest.temperatureC >= t.temperatureCritical
                    ? "critical"
                    : latest.temperatureC >= t.temperatureWarning
                      ? "warning"
                      : "normal"
              }
              size={124}
            />
            <Gauge
              label="Battery"
              value={latest.batteryPercent}
              min={0}
              max={100}
              threshold={t.batteryLow}
              unit="%"
              tone={
                latest.batteryPercent === null
                  ? "offline"
                  : latest.batteryPercent <= t.batteryLow
                    ? "critical"
                    : latest.batteryPercent <= t.batteryLow + 15
                      ? "warning"
                      : "normal"
              }
              size={124}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="ms-card-flat p-2">
              <p className="ms-label">Humidity</p>
              <p className="ms-mono text-base font-bold">{latest.humidityPercent ?? "--"} %</p>
            </div>
            <div className="ms-card-flat p-2">
              <p className="ms-label">|accel| (fall input)</p>
              <p className="ms-mono text-base font-bold">{latest.accelMagnitudeG ?? "--"} g</p>
            </div>
            {latest.pressureHpa !== null ? (
              <div className="ms-card-flat col-span-2 p-2">
                <p className="ms-label">Atmospheric pressure (optional sensor)</p>
                <p className="ms-mono text-base font-bold">{latest.pressureHpa} hPa</p>
              </div>
            ) : null}
          </div>

          <div className="mt-3">
            <p className="ms-label mb-1">Gas trend (latest sample per helmet)</p>
            <Sparkline
              values={gasSeries.length > 1 ? gasSeries : [latest.gasRaw ?? null, latest.gasRaw ?? null]}
              warnAt={t.gasWarning}
              critAt={t.gasCritical}
              label="Gas raw trend"
            />
          </div>

          <p className="ms-muted mt-2 text-[10px] leading-snug">
            ⚠️ Air quality shows the MQ-135 <strong>raw analog value</strong>. It is an air-quality indicator, not a
            calibrated AQI or ppm concentration. Last packet {formatClock(latest.receivedAt)} · anomaly{" "}
            {latest.anomalyLabel ?? "n/a"}
          </p>
        </Card>
      ) : (
        <EmptyState icon="📡" title="No helmet telemetry" message="Register a helmet and start the ESP32-S3 feed, or enable the simulated feed in Settings." />
      )}

      <SectionTitle
        title="Latest safety incidents"
        action={<Link className="ms-btn ms-btn-ghost !py-1 !text-[11px]" href="/alerts">View all</Link>}
      />
      {data.latestAlerts.length ? (
        <ul className="flex flex-col gap-2">
          {data.latestAlerts.slice(0, 4).map((alert) => (
            <li key={alert.id}>
              <Link href={`/alerts/${alert.id}`} className="ms-card block p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Pill tone={statusTone(alert.severity)}>{alert.severity}</Pill>
                      <span className="ms-muted text-[10px]">{alert.type}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold">{alert.title}</p>
                    <p className="ms-muted mt-0.5 line-clamp-2 text-[11px]">{alert.message}</p>
                  </div>
                  <span className="ms-muted shrink-0 text-[10px]">{timeAgo(alert.createdAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="✅" title="No incidents recorded" message="Alert history appears here as soon as the engine detects a hazard." />
      )}

      <SectionTitle title="Recent acknowledgements" hint="Resolved events are preserved permanently" />
      {data.incidents.length ? (
        <ul className="flex flex-col gap-2">
          {data.incidents.map((incident) => (
            <li key={incident.id} className="ms-card-flat flex items-center justify-between gap-2 p-3">
              <div>
                <p className="text-xs font-semibold">{incident.title}</p>
                <p className="ms-muted text-[10px]">
                  {incident.status} · {timeAgo(incident.resolvedAt)}
                </p>
              </div>
              <Pill tone={statusTone(incident.severity)}>{incident.status}</Pill>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="🗂️" title="No acknowledgements yet" message="Acknowledged and resolved alerts will be listed here." />
      )}
    </div>
  );
}
