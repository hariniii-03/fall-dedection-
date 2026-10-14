"use client";

import { useState } from "react";
import { BarChart, Card, EmptyState, MetricTile, SectionTitle, Spinner, formatDateTime } from "@/components/ui";
import type { ReportSummary } from "@/lib/queries";

const RANGES = [
  { key: "daily", label: "24 hours", hours: 24 },
  { key: "weekly", label: "7 days", hours: 24 * 7 },
  { key: "monthly", label: "30 days", hours: 24 * 30 },
] as const;

export function ReportsClient({ initial }: { initial: ReportSummary }) {
  const [summary, setSummary] = useState(initial);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("daily");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextRange: (typeof RANGES)[number]["key"]) {
    setRange(nextRange);
    setLoading(true);
    setError(null);
    try {
      const hours = RANGES.find((r) => r.key === nextRange)!.hours;
      const res = await fetch(`/api/reports/summary?range=${hours <= 24 ? "daily" : hours <= 24 * 7 ? "weekly" : "monthly"}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Could not build the report");
        return;
      }
      setSummary((await res.json()) as ReportSummary);
    } finally {
      setLoading(false);
    }
  }

  const csvHref = `/api/reports/export?status=all`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight">Safety History &amp; Reports</h1>
        <p className="ms-muted text-[11px]">
          {formatDateTime(summary.from)} → {formatDateTime(summary.to)}
        </p>
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="Report range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={range === r.key}
            onClick={() => load(r.key)}
            className={`flex-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              range === r.key
                ? "border-[var(--accent)] bg-[rgba(56,189,248,0.14)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner label="Building report" /> : null}
      {error ? (
        <p className="rounded-lg border border-[color:var(--crit)] bg-[rgba(239,68,68,0.12)] p-2 text-[11px]" role="alert">
          {error}
        </p>
      ) : null}

      <SectionTitle title="Incident counts" />
      <div className="grid grid-cols-2 gap-2.5">
        <MetricTile label="Total alerts" value={summary.totals.alerts} tone="info" icon="📋" />
        <MetricTile label="Critical" value={summary.totals.critical} tone="critical" icon="🚨" />
        <MetricTile label="Gas / air-quality" value={summary.totals.gasAlerts} tone="warning" icon="☁️" />
        <MetricTile label="Suspected falls" value={summary.totals.fallAlerts} tone="critical" icon="🤕" />
        <MetricTile label="High temperature" value={summary.totals.temperatureAlerts} tone="warning" icon="🌡️" />
        <MetricTile label="Offline helmets" value={summary.totals.offlineAlerts} tone="offline" icon="⛔" />
        <MetricTile label="SOS events" value={summary.totals.sosAlerts} tone="critical" icon="🆘" />
        <MetricTile label="AI anomaly flags" value={summary.totals.anomalyAlerts} tone="info" icon="🧠" />
      </div>

      <SectionTitle title="Alerts per day" hint="Critical share shown in red" />
      <Card>
        {summary.byDay.length ? (
          <BarChart
            data={summary.byDay.slice(-12).map((d) => ({
              label: d.day.slice(5),
              value: d.total,
              tone: d.critical > 0 ? "critical" : "info",
            }))}
          />
        ) : (
          <EmptyState icon="📊" title="No alerts in range" message="Nothing to chart for the selected period." />
        )}
      </Card>

      <SectionTitle title="Average readings" hint={`${summary.readingsIngested} packets · ${summary.deviceReadings} device / ${summary.simulatedReadings} simulated`} />
      <div className="grid grid-cols-2 gap-2.5">
        <MetricTile label="Avg air quality (raw)" value={summary.averages.gasRaw ?? "—"} unit="raw" tone="info" hint={`peak ${summary.peak.gasRaw ?? "—"}`} />
        <MetricTile label="Avg temperature" value={summary.averages.temperatureC ?? "—"} unit="°C" tone="info" hint={`peak ${summary.peak.temperatureC ?? "—"} °C`} />
        <MetricTile label="Avg humidity" value={summary.averages.humidityPercent ?? "—"} unit="%" tone="info" />
        <MetricTile label="Avg |accel|" value={summary.averages.accelMagnitudeG ?? "—"} unit="g" tone="info" hint={`peak ${summary.peak.accelMagnitudeG ?? "—"} g`} />
      </div>

      <SectionTitle title="Response performance" />
      <div className="grid grid-cols-2 gap-2.5">
        <MetricTile
          label="Ack time (avg)"
          value={summary.ackSeconds.average !== null ? `${summary.ackSeconds.average}s` : "—"}
          tone="warning"
          hint={`fastest ${summary.ackSeconds.fastest ?? "—"}s · slowest ${summary.ackSeconds.slowest ?? "—"}s`}
        />
        <MetricTile
          label="Resolution time (avg)"
          value={summary.resolveSeconds.average !== null ? `${summary.resolveSeconds.average}s` : "—"}
          tone="normal"
          hint={`fastest ${summary.resolveSeconds.fastest ?? "—"}s · slowest ${summary.resolveSeconds.slowest ?? "—"}s`}
        />
        <MetricTile label="Acknowledged" value={summary.totals.acknowledged} tone="info" />
        <MetricTile label="Resolved" value={summary.totals.resolved} tone="normal" />
      </div>

      <a className="ms-btn ms-btn-primary mt-2 w-full" href={csvHref} download>
        ⬇️ Export incident CSV
      </a>

      <p className="ms-muted pb-2 text-[10px] leading-snug">
        Reports are generated from persisted sensor readings and alerts. Detection accuracy has NOT been validated
        against real mine incidents — treat these figures as prototype telemetry, not certified safety statistics.
      </p>
    </div>
  );
}
