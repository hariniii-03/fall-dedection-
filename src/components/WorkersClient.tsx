"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, EmptyState, Pill, SectionTitle, Spinner, StatusDot, statusTone, timeAgo } from "@/components/ui";
import type { WorkerView } from "@/lib/queries";

type Props = {
  workers: WorkerView[];
  helmetCodes: string[];
  canManage: boolean;
};

const EMPTY_FORM = { code: "", fullName: "", department: "", zone: "", helmetCode: "", shift: "Day", phone: "" };

export function WorkersClient({ workers, helmetCodes, canManage }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function createWorker(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim() || undefined,
          fullName: form.fullName,
          department: form.department || undefined,
          zone: form.zone || undefined,
          shift: form.shift || undefined,
          phone: form.phone || null,
          helmetCode: form.helmetCode || null,
        }),
      });
      const json = (await res.json()) as { error?: string; worker?: { code: string }; details?: unknown };
      if (!res.ok) {
        setError(json.error ?? "Could not add worker");
        return;
      }
      setMessage(`Worker ${json.worker?.code} added and assigned.`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(worker: WorkerView) {
    setBusy(true);
    try {
      await fetch(`/api/workers/${worker.code}`, {
        method: worker.active ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        body: worker.active ? undefined : JSON.stringify({ active: true }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function assignHelmet(worker: WorkerView, helmetCode: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workers/${worker.code}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ helmetCode: helmetCode || null }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "Assignment failed");
      } else {
        setMessage(`${worker.code} assigned to ${helmetCode || "no helmet"}`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">Worker Management</h1>
          <p className="ms-muted text-[11px]">{workers.length} worker(s) · helmet assignment &amp; safety status</p>
        </div>
        {canManage ? (
          <button className="ms-btn ms-btn-primary !py-1.5 !text-[11px]" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "+ Add worker"}
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-lg border border-[color:var(--safe)] bg-[rgba(34,197,94,0.12)] p-2 text-[11px]">{message}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-[color:var(--crit)] bg-[rgba(239,68,68,0.12)] p-2 text-[11px]" role="alert">
          {error}
        </p>
      ) : null}

      {showForm && canManage ? (
        <Card className="ms-slide-up">
          <form onSubmit={createWorker} className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <LabeledInput label="Worker ID" value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="auto" />
              <LabeledInput label="Full name" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} placeholder="Ravi Kumar" required />
              <LabeledInput label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} placeholder="Drilling" />
              <LabeledInput label="Zone" value={form.zone} onChange={(v) => setForm({ ...form, zone: v })} placeholder="Zone-A" />
              <label className="flex flex-col gap-1">
                <span className="ms-label">Helmet</span>
                <select className="ms-input" value={form.helmetCode} onChange={(e) => setForm({ ...form, helmetCode: e.target.value })}>
                  <option value="">Unassigned</option>
                  {helmetCodes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <LabeledInput label="Shift" value={form.shift} onChange={(v) => setForm({ ...form, shift: v })} placeholder="Day" />
            </div>
            <button className="ms-btn ms-btn-primary" disabled={busy || form.fullName.trim().length < 2}>
              {busy ? "Saving…" : "Save worker"}
            </button>
          </form>
        </Card>
      ) : null}

      <SectionTitle title="Workers" hint="Tap a worker for helmet readings and incident history" />
      {workers.length === 0 ? (
        <EmptyState icon="👷" title="No workers yet" message="Add a worker and assign a helmet to begin monitoring." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {workers.map((worker) => (
            <li key={worker.code} className="ms-card p-3">
              <Link href={`/workers/${worker.code}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusDot tone={statusTone(worker.safetyStatus)} pulse={worker.safetyStatus === "critical"} />
                    <div>
                      <p className="text-xs font-bold">
                        {worker.fullName} <span className="ms-muted">· {worker.code}</span>
                      </p>
                      <p className="ms-muted text-[10px]">
                        {worker.department} · {worker.zone} · {worker.shift} shift
                      </p>
                    </div>
                  </div>
                  <Pill tone={statusTone(worker.safetyStatus)}>{worker.safetyStatus}</Pill>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  <div className="ms-card-flat p-2">
                    <p className="ms-label">Helmet</p>
                    <p className="ms-mono font-bold">{worker.helmetCode ?? "—"}</p>
                  </div>
                  <div className="ms-card-flat p-2">
                    <p className="ms-label">Link</p>
                    <p className="ms-mono font-bold">{worker.connectionState}</p>
                  </div>
                  <div className="ms-card-flat p-2">
                    <p className="ms-label">Battery</p>
                    <p className="ms-mono font-bold">{worker.batteryPercent !== null ? `${Math.round(worker.batteryPercent)}%` : "—"}</p>
                  </div>
                </div>
                <p className="ms-muted mt-1.5 text-[10px]">Last update {timeAgo(worker.lastReadingAt)}</p>
                {worker.recentAlerts.length ? (
                  <p className="ms-muted mt-1 text-[10px]">
                    Recent: {worker.recentAlerts.map((a) => `${a.title} (${a.status})`).join(", ")}
                  </p>
                ) : (
                  <p className="ms-muted mt-1 text-[10px]">No recent incidents.</p>
                )}
              </Link>

              {canManage ? (
                <div className="mt-2.5 flex items-center gap-2">
                  <select
                    className="ms-input !py-1.5 !text-[11px]"
                    value={worker.helmetCode ?? ""}
                    onChange={(e) => assignHelmet(worker, e.target.value)}
                    aria-label={`Assign helmet for ${worker.code}`}
                  >
                    <option value="">Unassign helmet</option>
                    {helmetCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button className="ms-btn ms-btn-ghost !py-1.5 !text-[11px]" disabled={busy} onClick={() => toggleActive(worker)}>
                    {worker.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              ) : null}
              {busy ? (
                <div className="mt-2">
                  <Spinner label="Updating worker" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="ms-label">{label}</span>
      <input
        className="ms-input"
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
