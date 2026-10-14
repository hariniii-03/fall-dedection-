"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Pill, SectionTitle, Spinner, formatDateTime, statusTone } from "@/components/ui";
import type { AlertView } from "@/lib/queries";

export function AlertDetailClient({ alert, canAct }: { alert: AlertView; canAct: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [local, setLocal] = useState(alert);

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Request failed");
        return;
      }
      const json = (await res.json()) as { alert: { status: string; acknowledgedAt?: string | null; resolvedAt?: string | null; acknowledgementNote?: string | null; resolutionNotes?: string | null } };
      setLocal({ ...local, ...json.alert } as AlertView);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const snapshot = (local.snapshot ?? {}) as Record<string, number | string | null>;
  const isEmergency = local.type === "fall" || local.type === "sos" || local.severity === "critical";

  return (
    <div className="flex flex-col gap-3">
      <Link href="/alerts" className="ms-muted text-[11px]">
        ← Back to alerts
      </Link>

      {isEmergency && local.status !== "resolved" ? (
        <div className="rounded-xl border border-[color:var(--crit)] bg-[rgba(239,68,68,0.16)] p-3" role="alert">
          <p className="text-sm font-extrabold uppercase tracking-wide text-[color:var(--crit)]">
            Emergency response required
          </p>
          <p className="mt-1 text-[11px]">
            Verify the worker&apos;s condition, confirm their location, and dispatch the rescue team. Escalation
            contact is available in Settings.
          </p>
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={statusTone(local.severity)}>{local.severity}</Pill>
          <Pill tone={local.status === "resolved" ? "normal" : local.status === "acknowledged" ? "warning" : "critical"}>
            {local.status}
          </Pill>
          <span className="ms-muted text-[10px] uppercase">{local.type}</span>
        </div>
        <h1 className="mt-2 text-base font-extrabold">{local.title}</h1>
        <p className="mt-1 text-xs leading-relaxed">{local.message}</p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <Field label="Worker" value={local.workerCode ? `${local.workerCode} · ${local.workerName ?? ""}` : "unassigned"} />
          <Field label="Helmet" value={local.helmetCode ?? "unassigned"} />
          <Field label="Detected at" value={formatDateTime(local.createdAt)} />
          <Field label="Data source" value={String(local.source)} />
          <Field label="Rule" value={local.ruleId ?? "—"} />
          <Field label="Detector" value={local.detector} />
          <Field label="Measured" value={local.measuredValue !== null ? `${local.measuredValue} ${local.unit ?? ""}` : "—"} />
          <Field label="Threshold" value={local.threshold !== null ? `${local.threshold} ${local.unit ?? ""}` : "—"} />
          <Field label="Location" value={local.location ?? "Location source not integrated"} />
          <Field label="Zone" value={local.zone ?? "—"} />
        </dl>
      </Card>

      <SectionTitle title="Why this alert fired" hint="Explainable detection trace" />
      <Card>
        <p className="text-[11px] leading-relaxed">{local.explanation ?? "No explanation recorded."}</p>
      </Card>

      <SectionTitle title="Sensor snapshot at detection" />
      <Card>
        <dl className="grid grid-cols-2 gap-2 text-[11px]">
          {Object.entries(snapshot).length === 0 ? (
            <p className="ms-muted col-span-2">No sensor snapshot stored for this alert.</p>
          ) : (
            Object.entries(snapshot).map(([key, value]) => <Field key={key} label={key} value={value === null ? "—" : String(value)} />)
          )}
        </dl>
      </Card>

      <SectionTitle title="Response timeline" />
      <Card>
        <ol className="flex flex-col gap-2 text-[11px]">
          <TimelineRow title="Alert generated" value={formatDateTime(local.createdAt)} done />
          <TimelineRow title="Acknowledged" value={local.acknowledgedAt ? `${formatDateTime(local.acknowledgedAt)} (${local.ackSeconds ?? "?"}s)` : "pending"} done={Boolean(local.acknowledgedAt)} />
          <TimelineRow title="Resolved" value={local.resolvedAt ? `${formatDateTime(local.resolvedAt)} (${local.resolveSeconds ?? "?"}s)` : "pending"} done={Boolean(local.resolvedAt)} />
        </ol>
        {local.acknowledgementNote ? (
          <p className="ms-muted mt-2 text-[10px]">Ack note: {local.acknowledgementNote}</p>
        ) : null}
        {local.resolutionNotes ? <p className="ms-muted mt-1 text-[10px]">Resolution: {local.resolutionNotes}</p> : null}
      </Card>

      {error ? (
        <p className="rounded-lg border border-[color:var(--crit)] bg-[rgba(239,68,68,0.12)] p-2 text-[11px]" role="alert">
          {error}
        </p>
      ) : null}

      {canAct && local.status !== "resolved" ? (
        <Card>
          <p className="ms-label mb-2">Supervisor response</p>
          <textarea
            className="ms-input min-h-[70px]"
            placeholder="Resolution notes (required to close the alert)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Resolution notes"
          />
          <div className="mt-2 flex gap-2">
            <button
              className="ms-btn ms-btn-primary flex-1"
              disabled={busy || local.status === "acknowledged"}
              onClick={() => post(`/api/alerts/${local.id}/acknowledge`, { note: "Acknowledged from emergency response screen" })}
            >
              {local.status === "acknowledged" ? "Acknowledged ✓" : "Acknowledge"}
            </button>
            <button
              className="ms-btn ms-btn-danger flex-1"
              disabled={busy || notes.trim().length < 3}
              onClick={() => post(`/api/alerts/${local.id}/resolve`, { resolutionNotes: notes.trim() })}
            >
              Resolve
            </button>
          </div>
          {busy ? (
            <div className="mt-2">
              <Spinner label="Submitting response" />
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ms-card-flat p-2">
      <dt className="ms-label">{label}</dt>
      <dd className="ms-mono mt-0.5 break-words text-[11px] font-semibold">{value}</dd>
    </div>
  );
}

function TimelineRow({ title, value, done }: { title: string; value: string; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${done ? "bg-[var(--safe)] text-black" : "bg-[var(--surface-3)] text-[var(--muted)]"}`}>
        {done ? "✓" : "•"}
      </span>
      <span className="font-semibold">{title}</span>
      <span className="ms-muted">{value}</span>
    </li>
  );
}
