"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLive } from "@/components/LiveProvider";
import {
  Card,
  EmptyState,
  Gauge,
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

type Series = Record<string, { t: string; gasRaw: number | null; temperatureC: number | null; humidityPercent: number | null; accelMagnitudeG: number | null }[]>;

export function MonitorClient({
  initialSnapshot,
  initialSeries,
}: {
  initialSnapshot: DashboardSnapshot;
  initialSeries: Series;
}) {
  const { snapshot, connection, stale } = useLive();
  const data = snapshot ?? initialSnapshot;
  const [selected, setSelected] = useState(data.helmets[0]?.code ?? "");
  const [series, setSeries] = useState<Series>(initialSeries);
  const [loadingSeries, setLoadingSeries] = useState(false);

  const helmet = data.helmets.find((h) => h.code === selected) ?? data.helmets[0] ?? null;
  const t = data.thresholds;

  async function loadSeries(code: string) {
    setLoadingSeries(true);
    try {
      const res = await fetch(`/api/readings/history?helmet=${encodeURIComponent(code)}&limit=60`, { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { series: Series[string] };
        setSeries((prev) => ({ ...prev, [code]: json.series }));
      }
    } finally {
      setLoadingSeries(false);
    }
  }

  const points = useMemo(() => (helmet ? (series[helmet.code] ?? []) : []), [helmet, series]);
  const latest = helmet?.latest ?? null;

  if (!helmet) {
    return <EmptyState icon="📡" title="No helmets registered" message="Add a helmet in the helmet manager to start monitoring." />;
  }

  const gasTone =
    latest?.gasRaw === null || latest?.gasRaw === undefined
      ? "offline"
      : latest.gasRaw >= t.gasCritical
        ? "critical"
        : latest.gasRaw >= t.gasWarning
          ? "warning"
          : "normal";
  const tempTone =
    latest?.temperatureC === null || latest?.temperatureC === undefined
      ? "offline"
      : latest.temperatureC >= t.temperatureCritical
        ? "critical"
        : latest.temperatureC >= t.temperatureWarning
          ? "warning"
          : "normal";
  const batteryTone =
    latest?.batteryPercent === null || latest?.batteryPercent === undefined
      ? "offline"
      : latest.batteryPercent <= t.batteryLow
        ? "critical"
        : "normal";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight">Live Monitoring</h1>
        <p className="ms-muted text-[11px]">
          Stream: {connection} {stale ? "· readings stale" : ""} · last packet {timeAgo(latest?.receivedAt)}
        </p>
      </div>

      <div className="ms-scroll-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Select helmet">
        {data.helmets.map((h) => (
          <button
            key={h.code}
            role="tab"
            aria-selected={h.code === helmet.code}
            onClick={() => {
              setSelected(h.code);
              void loadSeries(h.code);
            }}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold ${
              h.code === helmet.code
                ? "border-[var(--accent)] bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
            }`}
          >
            <StatusDot tone={statusTone(h.connectionState === "online" ? "normal" : h.connectionState)} />
            {h.code}
          </button>
        ))}
      </div>

      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold">{helmet.code}</p>
            <p className="ms-muted text-[11px]">
              {helmet.workerCode ? `${helmet.workerCode} · ${helmet.workerName}` : "No worker assigned"} ·{" "}
              {helmet.zone ?? "no zone"}
            </p>
            <p className="ms-muted mt-1 text-[10px]">
              Firmware {helmet.firmwareVersion ?? "unknown"} · sensor {helmet.gasSensorModel ?? "n/a"} · heartbeat{" "}
              {timeAgo(helmet.lastHeartbeatAt)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Pill tone={statusTone(helmet.connectionState === "online" ? "normal" : helmet.connectionState)}>
              {helmet.connectionState}
            </Pill>
            <SimulatedBadge source={latest?.source} />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Gauge label="Air quality (raw)" value={latest?.gasRaw ?? null} min={0} max={2000} threshold={t.gasCritical} unit="raw" tone={gasTone} size={120} />
          <Gauge label="Temperature" value={latest?.temperatureC ?? null} min={20} max={60} threshold={t.temperatureCritical} unit="°C" tone={tempTone} size={120} />
          <Gauge label="Battery" value={latest?.batteryPercent ?? null} min={0} max={100} threshold={t.batteryLow} unit="%" tone={batteryTone} size={120} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="ms-card-flat p-2">
            <p className="ms-label">Humidity</p>
            <p className="ms-mono text-sm font-bold">{latest?.humidityPercent ?? "--"} %</p>
          </div>
          <div className="ms-card-flat p-2">
            <p className="ms-label">|accel|</p>
            <p className="ms-mono text-sm font-bold">{latest?.accelMagnitudeG ?? "--"} g</p>
          </div>
          <div className="ms-card-flat p-2">
            <p className="ms-label">AI anomaly</p>
            <p className="text-sm font-bold">{latest?.anomalyLabel ?? "n/a"}</p>
          </div>
          {latest?.pressureHpa !== null && latest?.pressureHpa !== undefined ? (
            <div className="ms-card-flat col-span-3 p-2">
              <p className="ms-label">Atmospheric pressure (optional BMP sensor)</p>
              <p className="ms-mono text-sm font-bold">{latest.pressureHpa} hPa</p>
            </div>
          ) : null}
        </div>

        {helmet.connectionState === "offline" ? (
          <p className="mt-3 rounded-lg border border-[color:var(--offline)] bg-[rgba(100,116,139,0.14)] p-2 text-[11px]">
            ⛔ Last known readings shown below are <strong>stale</strong> (last packet {formatClock(latest?.receivedAt)}).
            Missing data is treated as UNKNOWN, not as safe.
          </p>
        ) : null}

        {helmet.sensors.pressure === false ? (
          <p className="ms-muted mt-2 text-[10px]">
            Pressure sensor not installed on this helmet — the field is disabled in firmware and shown as unavailable.
          </p>
        ) : null}
      </Card>

      <SectionTitle title="Historical trends" hint="Last 60 packets for the selected helmet" action={loadingSeries ? <span className="ms-muted text-[10px]">loading…</span> : undefined} />
      {points.length > 1 ? (
        <div className="flex flex-col gap-2">
          {[
            { key: "gasRaw", label: "Air quality (MQ-135 raw)", warnAt: t.gasWarning, critAt: t.gasCritical, unit: "raw" },
            { key: "temperatureC", label: "Temperature", warnAt: t.temperatureWarning, critAt: t.temperatureCritical, unit: "°C" },
            { key: "humidityPercent", label: "Humidity", warnAt: t.humidityWarning, unit: "%" },
            { key: "accelMagnitudeG", label: "Accelerometer magnitude", warnAt: t.fallImpactG, critAt: t.fallImpactG * 1.2, unit: "g" },
          ].map((chart) => (
            <Card key={chart.key}>
              <div className="mb-1 flex items-center justify-between">
                <p className="ms-label">{chart.label}</p>
                <span className="ms-muted text-[10px]">{chart.unit}</span>
              </div>
              <Sparkline
                values={points.map((p) => p[chart.key as keyof typeof p] as number | null)}
                warnAt={chart.warnAt}
                critAt={chart.critAt}
                label={chart.label}
                height={54}
              />
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon="📈" title="Not enough history" message="Select another helmet or wait for more packets to arrive." />
      )}

      <SectionTitle title="Active alert indicators" />
      {helmet.activeAlertCount ? (
        <Link href="/alerts" className="ms-card flex items-center justify-between p-3">
          <span className="text-xs font-semibold">{helmet.activeAlertCount} open alert(s) for {helmet.code}</span>
          <Pill tone={statusTone(helmet.safetyStatus)}>Review</Pill>
        </Link>
      ) : (
        <EmptyState icon="✅" title="No active alerts" message={`Helmet ${helmet.code} is within configured thresholds.`} />
      )}

      <p className="ms-muted pb-2 text-[10px] leading-snug">
        Transport: SSE stream with automatic polling fallback. Readings are labelled DEVICE or SIMULATED at ingestion
        time so test data can never be mistaken for real telemetry.
      </p>
    </div>
  );
}
