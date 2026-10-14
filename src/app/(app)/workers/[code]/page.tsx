import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, Gauge, Pill, SectionTitle, SimulatedBadge, Sparkline, formatDateTime, statusTone, timeAgo } from "@/components/ui";
import { getWorkerDetail } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function WorkerDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [detail, thresholds] = await Promise.all([getWorkerDetail(code), getSettings()]);
  if (!detail) notFound();

  const { worker, helmet, history, alerts } = detail;
  const latest = history.length ? history[history.length - 1] : null;

  return (
    <div className="flex flex-col gap-3">
      <Link href="/workers" className="ms-muted text-[11px]">
        ← Back to workers
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-extrabold">{worker.fullName}</h1>
            <p className="ms-muted text-[11px]">
              {worker.code} · {worker.department} · {worker.zone} · {worker.shift} shift
            </p>
            <p className="ms-muted text-[10px]">Contact {worker.phone ?? "not configured"}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Pill tone={statusTone(worker.safetyStatus)}>{worker.safetyStatus}</Pill>
            <Pill tone={worker.active ? "normal" : "offline"}>{worker.active ? "active" : "deactivated"}</Pill>
          </div>
        </div>
      </Card>

      {helmet ? (
        <>
          <SectionTitle title={`Helmet ${helmet.code}`} hint={`Connection ${helmet.connectionState} · last update ${timeAgo(helmet.lastReadingAt)}`} action={<SimulatedBadge source={latest?.source} />} />
          <Card>
            <div className="grid grid-cols-3 gap-1">
              <Gauge
                label="Air quality (raw)"
                value={latest?.gasRaw ?? null}
                min={0}
                max={2000}
                threshold={thresholds.gasCritical}
                unit="raw"
                tone={latest?.gasRaw === null || latest?.gasRaw === undefined ? "offline" : latest.gasRaw >= thresholds.gasCritical ? "critical" : latest.gasRaw >= thresholds.gasWarning ? "warning" : "normal"}
                size={110}
              />
              <Gauge
                label="Temperature"
                value={latest?.temperatureC ?? null}
                min={20}
                max={60}
                threshold={thresholds.temperatureCritical}
                unit="°C"
                tone={latest?.temperatureC === null || latest?.temperatureC === undefined ? "offline" : latest.temperatureC >= thresholds.temperatureCritical ? "critical" : "normal"}
                size={110}
              />
              <Gauge label="Battery" value={latest?.batteryPercent ?? null} min={0} max={100} threshold={thresholds.batteryLow} unit="%" tone="info" size={110} />
            </div>
            <p className="ms-muted mt-2 text-[10px]">
              Sensors enabled: {Object.entries(helmet.sensors).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"} ·
              anomaly state {latest?.anomalyLabel ?? "n/a"}
            </p>
          </Card>

          <SectionTitle title="Air quality history (60 packets)" />
          <Card>
            <Sparkline
              values={history.map((h) => h.gasRaw)}
              warnAt={thresholds.gasWarning}
              critAt={thresholds.gasCritical}
              label="Worker gas history"
              height={60}
            />
          </Card>

          <SectionTitle title="Accelerometer history" hint="Input to the fall-detection rule" />
          <Card>
            <Sparkline values={history.map((h) => h.accelMagnitudeG)} warnAt={thresholds.fallImpactG} label="Worker accel history" height={60} />
          </Card>
        </>
      ) : (
        <EmptyState icon="⛑️" title="No helmet assigned" message="Assign a helmet to this worker to stream readings." />
      )}

      <SectionTitle title="Safety history" hint="Acknowledged and resolved events are preserved" />
      {alerts.length ? (
        <ul className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link href={`/alerts/${alert.id}`} className="ms-card-flat flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-xs font-semibold">{alert.title}</p>
                  <p className="ms-muted text-[10px]">
                    {formatDateTime(alert.createdAt)} · rule {alert.ruleId ?? "—"} · {alert.status}
                  </p>
                </div>
                <Pill tone={statusTone(alert.severity)}>{alert.severity}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="🗂️" title="No incidents" message="This worker has no recorded alerts." />
      )}
    </div>
  );
}
