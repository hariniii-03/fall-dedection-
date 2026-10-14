"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState, Pill, SectionTitle, Spinner, statusTone, timeAgo } from "@/components/ui";
import type { AlertView } from "@/lib/queries";

type Tab = "active" | "critical" | "acknowledged" | "resolved" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "critical", label: "Critical" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

export function AlertsClient({ initialAlerts, canAct }: { initialAlerts: AlertView[]; canAct: boolean }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(initialAlerts);
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pendingResolve, setPendingResolve] = useState<number | null>(null);

  const types = useMemo(() => ["all", ...Array.from(new Set(initialAlerts.map((a) => a.type)))], [initialAlerts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts.filter((a) => {
      if (tab === "critical" && !(a.severity === "critical" && a.status !== "resolved")) return false;
      if (tab !== "critical" && tab !== "all" && a.status !== tab) return false;
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (!q) return true;
      return [a.title, a.message, a.workerCode, a.workerName, a.helmetCode, a.ruleId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [alerts, tab, typeFilter, query]);

  async function reload() {
    const res = await fetch("/api/alerts?limit=200&runOfflineCheck=1", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { alerts: AlertView[] };
      setAlerts(json.alerts);
      router.refresh();
    }
  }

  async function acknowledge(id: number) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${id}/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to acknowledge");
      } else {
        setNote("");
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(id: number, resolutionNotes: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolutionNotes }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to resolve");
      } else {
        setPendingResolve(null);
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  const unreadCount = alerts.filter((a) => a.status === "active").length;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight">Notification Center</h1>
        <p className="ms-muted text-[11px]">
          {unreadCount} active · history is never deleted (audit requirement)
        </p>
      </div>

      <input
        className="ms-input"
        placeholder="Search worker, helmet, rule, message…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search alerts"
      />

      <div className="ms-scroll-hide -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="Alert filters">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              tab === item.key
                ? "border-[var(--accent)] bg-[rgba(56,189,248,0.14)] text-[var(--text)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="ms-scroll-hide -mx-1 flex gap-1.5 overflow-x-auto px-1" aria-label="Alert type filter">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
              typeFilter === t ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--muted)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-[color:var(--crit)] bg-[rgba(239,68,68,0.12)] p-2 text-[11px]" role="alert">
          {error}
        </p>
      ) : null}

      {canAct ? (
        <input
          className="ms-input"
          placeholder="Acknowledgement note (optional) — e.g. 'Ventilation team dispatched'"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Acknowledgement note"
        />
      ) : null}

      <SectionTitle title={`${filtered.length} alert(s)`} />
      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No alerts match" message="Try another filter, or trigger a test scenario from Settings." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((alert) => (
            <li key={alert.id} className="ms-card p-3">
              <Link href={`/alerts/${alert.id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={statusTone(alert.severity)}>{alert.severity}</Pill>
                    <Pill tone={alert.status === "resolved" ? "normal" : alert.status === "acknowledged" ? "warning" : "critical"}>
                      {alert.status}
                    </Pill>
                    <span className="ms-muted text-[10px] uppercase">{alert.type}</span>
                    {alert.source !== "device" ? <span className="ms-muted text-[10px]">· {alert.source}</span> : null}
                  </div>
                  <span className="ms-muted shrink-0 text-[10px]">{timeAgo(alert.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-xs font-bold">{alert.title}</p>
                <p className="ms-muted mt-0.5 text-[11px] leading-snug">{alert.message}</p>
                <p className="ms-muted mt-1 text-[10px]">
                  {alert.workerCode ?? "no worker"} · {alert.helmetCode ?? "no helmet"} · rule {alert.ruleId ?? "n/a"} ·{" "}
                  {alert.measuredValue ?? "--"} {alert.unit ?? ""} (limit {alert.threshold ?? "--"})
                </p>
              </Link>

              {canAct && alert.status !== "resolved" ? (
                <div className="mt-2.5 flex gap-2">
                  <button
                    className="ms-btn ms-btn-primary flex-1 !py-1.5 !text-[11px]"
                    disabled={busyId === alert.id || alert.status === "acknowledged"}
                    onClick={() => acknowledge(alert.id)}
                  >
                    {alert.status === "acknowledged" ? "Acknowledged ✓" : "Acknowledge"}
                  </button>
                  <button
                    className="ms-btn flex-1 !py-1.5 !text-[11px]"
                    disabled={busyId === alert.id}
                    onClick={() => setPendingResolve(alert.id)}
                  >
                    Resolve
                  </button>
                </div>
              ) : null}

              {pendingResolve === alert.id ? (
                <ResolveForm
                  onCancel={() => setPendingResolve(null)}
                  onSubmit={(text) => resolve(alert.id, text)}
                  busy={busyId === alert.id}
                />
              ) : null}

              {alert.status === "resolved" && alert.resolutionNotes ? (
                <p className="ms-muted mt-2 text-[10px]">Resolution: {alert.resolutionNotes}</p>
              ) : null}
              {busyId === alert.id ? (
                <div className="mt-2">
                  <Spinner label="Updating alert" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResolveForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <div className="ms-slide-up mt-2.5 flex flex-col gap-2">
      <textarea
        className="ms-input min-h-[64px]"
        placeholder="Resolution notes (required) — what action was taken?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Resolution notes"
      />
      <div className="flex gap-2">
        <button className="ms-btn ms-btn-primary flex-1 !py-1.5 !text-[11px]" disabled={busy || text.trim().length < 3} onClick={() => onSubmit(text.trim())}>
          Save resolution
        </button>
        <button className="ms-btn ms-btn-ghost !py-1.5 !text-[11px]" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
