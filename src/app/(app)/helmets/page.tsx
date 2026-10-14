import Link from "next/link";
import { Card, Pill, SectionTitle, formatDateTime, statusTone, timeAgo } from "@/components/ui";
import { getHelmetViews } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HelmetsPage() {
  const helmets = await getHelmetViews();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight">Helmet Management</h1>
        <p className="ms-muted text-[11px]">{helmets.length} ESP32-S3 helmet node(s) registered</p>
      </div>

      <SectionTitle title="Registered helmets" hint="Firmware registers itself automatically on first POST /api/ingest/sensor" />
      <ul className="flex flex-col gap-2.5">
        {helmets.map((helmet) => (
          <li key={helmet.code} className="ms-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold">{helmet.code}</p>
                <p className="ms-muted text-[11px]">
                  {helmet.workerCode ? `${helmet.workerCode} · ${helmet.workerName}` : "unassigned"} · {helmet.zone ?? "—"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Pill tone={statusTone(helmet.connectionState === "online" ? "normal" : helmet.connectionState)}>
                  {helmet.connectionState}
                </Pill>
                <Pill tone={helmet.dataSource === "device" ? "normal" : "info"}>{helmet.dataSource}</Pill>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className="ms-card-flat p-2">
                <p className="ms-label">Battery</p>
                <p className="ms-mono text-sm font-bold">
                  {helmet.batteryPercent !== null ? `${Math.round(helmet.batteryPercent)}%` : "—"}
                </p>
              </div>
              <div className="ms-card-flat p-2">
                <p className="ms-label">Firmware</p>
                <p className="ms-mono text-[11px] font-bold">{helmet.firmwareVersion ?? "unknown"}</p>
              </div>
              <div className="ms-card-flat p-2">
                <p className="ms-label">Last heartbeat</p>
                <p className="ms-mono text-[11px] font-bold">{timeAgo(helmet.lastHeartbeatAt)}</p>
              </div>
              <div className="ms-card-flat p-2">
                <p className="ms-label">Last reading</p>
                <p className="ms-mono text-[11px] font-bold">{timeAgo(helmet.lastReadingAt)}</p>
              </div>
            </div>

            <div className="mt-2">
              <p className="ms-label mb-1">Sensor availability</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(helmet.sensors).map(([key, enabled]) => (
                  <span
                    key={key}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      enabled
                        ? "border-[color:var(--safe)] text-[color:var(--safe)]"
                        : "border-[var(--border)] text-[var(--muted)] line-through"
                    }`}
                  >
                    {key}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
              <div className="ms-card-flat p-2">
                <p className="ms-label">Gas raw</p>
                <p className="ms-mono text-sm font-bold">{helmet.latest?.gasRaw ?? "—"}</p>
              </div>
              <div className="ms-card-flat p-2">
                <p className="ms-label">Temp</p>
                <p className="ms-mono text-sm font-bold">{helmet.latest?.temperatureC ?? "—"} °C</p>
              </div>
              <div className="ms-card-flat p-2">
                <p className="ms-label">|accel|</p>
                <p className="ms-mono text-sm font-bold">{helmet.latest?.accelMagnitudeG ?? "—"} g</p>
              </div>
            </div>

            <p className="ms-muted mt-2 text-[10px]">Latest packet stored {formatDateTime(helmet.latest?.receivedAt)}</p>
          </li>
        ))}
      </ul>

      <Card>
        <p className="ms-label mb-1">Add a helmet</p>
        <p className="ms-muted text-[11px] leading-relaxed">
          Helmets self-register on first telemetry, or an administrator can POST to <code>/api/helmets</code>. Sensor
          availability (e.g. no pressure sensor) is configured per helmet and respected by the detection engine — see{" "}
          <Link href="/more" className="text-[var(--accent)]">
            documentation
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
