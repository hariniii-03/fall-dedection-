"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState, Pill, SectionTitle, Spinner, statusTone, timeAgo } from "@/components/ui";

export type NotificationItem = {
  id: number;
  alertId: number | null;
  title: string;
  body: string;
  priority: string;
  channel: string;
  deliveryStatus: string;
  deliveryDetail: string | null;
  readAt: string | null;
  createdAt: string | null;
  alertStatus: string | null;
  alertSeverity: string | null;
};

export function NotificationsClient({ initial }: { initial: NotificationItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");
  const [busy, setBusy] = useState(false);

  const filtered = items.filter((n) =>
    filter === "unread" ? !n.readAt : filter === "critical" ? n.priority === "critical" : true,
  );
  const unread = items.filter((n) => !n.readAt).length;

  async function markAllRead() {
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
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
          <h1 className="text-lg font-extrabold tracking-tight">Notifications</h1>
          <p className="ms-muted text-[11px]">{unread} unread · delivery status recorded per recipient</p>
        </div>
        <button className="ms-btn ms-btn-ghost !py-1.5 !text-[11px]" disabled={busy || unread === 0} onClick={markAllRead}>
          Mark all read
        </button>
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="Notification filter">
        {(["all", "unread", "critical"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              filter === key
                ? "border-[var(--accent)] bg-[rgba(56,189,248,0.14)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <SectionTitle title={`${filtered.length} notification(s)`} />
      {filtered.length === 0 ? (
        <EmptyState icon="🔔" title="Nothing here" message="New alerts will create a notification for your account." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((n) => (
            <li key={n.id} className={`ms-card p-3 ${n.readAt ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={statusTone(n.priority === "critical" ? "critical" : n.priority === "warning" ? "warning" : "info")}>
                    {n.priority}
                  </Pill>
                  <span className="ms-muted text-[10px] uppercase">
                    {n.channel} · {n.deliveryStatus}
                  </span>
                </div>
                <span className="ms-muted shrink-0 text-[10px]">{timeAgo(n.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-xs font-bold">{n.title}</p>
              <p className="ms-muted mt-0.5 text-[11px] leading-snug">{n.body}</p>
              {n.deliveryDetail ? <p className="ms-muted mt-1 text-[10px]">Delivery: {n.deliveryDetail}</p> : null}
              <div className="mt-2 flex items-center gap-2">
                {n.alertId ? (
                  <Link href={`/alerts/${n.alertId}`} className="ms-btn ms-btn-primary !py-1 !text-[11px]">
                    Open alert
                  </Link>
                ) : null}
                {!n.readAt ? (
                  <button
                    className="ms-btn ms-btn-ghost !py-1 !text-[11px]"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await fetch("/api/notifications", {
                          method: "PATCH",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ ids: [n.id] }),
                        });
                        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
                        router.refresh();
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {busy ? (
        <Spinner label="Syncing" />
      ) : null}

      <p className="ms-muted pb-2 text-[10px] leading-snug">
        Remote push delivery requires EXPO_ACCESS_TOKEN (see docs/PUSH_NOTIFICATIONS.md). Without it the backend stores
        the notification and the client shows a LOCAL notification fallback.
      </p>
    </div>
  );
}
