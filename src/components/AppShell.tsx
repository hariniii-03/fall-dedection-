"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLive } from "@/components/LiveProvider";
import { Pill, StatusDot, timeAgo } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/monitor", label: "Live", icon: "📶" },
  { href: "/alerts", label: "Alerts", icon: "🚨" },
  { href: "/workers", label: "Workers", icon: "👷" },
  { href: "/more", label: "More", icon: "☰" },
];

export type ShellUser = {
  id: number;
  username: string;
  role: "worker" | "supervisor" | "admin";
  fullName: string;
  workerCode: string | null;
};

export function AppShell({ user, unread, children }: { user: ShellUser; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { snapshot, connection, stale, dismissBanner, bannerDismissed } = useLive();
  const [sosState, setSosState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  const criticalOpen = (snapshot?.latestAlerts ?? []).filter(
    (a) => a.severity === "critical" && a.status !== "resolved",
  );
  const hazard = snapshot?.hazard;
  const showBanner = !bannerDismissed && hazard && hazard.level !== "normal";

  async function sendSos() {
    setSosState("sending");
    try {
      const res = await fetch("/api/alerts/sos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workerCode: user.workerCode ?? undefined,
          note: `SOS from ${user.role} app (${user.fullName})`,
          source: "manual",
        }),
      });
      if (res.ok) {
        setSosState("sent");
        await fetch("/api/dashboard?advance=0", { cache: "no-store" }).catch(() => undefined);
        router.refresh();
        setTimeout(() => setSosState("idle"), 4000);
      } else {
        setSosState("idle");
      }
    } catch {
      setSosState("idle");
    }
  }

  const connTone = connection === "live" ? "normal" : connection === "polling" ? "warning" : "offline";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col bg-[var(--bg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(6,10,17,0.92)] px-4 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0369a1] text-base">
              ⛑️
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">MineSafe AI</p>
              <p className="ms-muted text-[10px] uppercase tracking-wider">
                {user.role} · {user.fullName.split(" ")[0]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              🔔
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--crit)] px-1 text-[9px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
          <span className="ms-muted flex items-center gap-1.5">
            <StatusDot tone={connTone} pulse={connection === "live"} />
            {connection === "live" ? "Live stream" : connection === "polling" ? "Reconnecting…" : "Offline"}
            {stale ? " · stale" : ""}
          </span>
          <span className="ms-muted">Updated {timeAgo(snapshot?.generatedAt)}</span>
        </div>
      </header>

      {showBanner && hazard ? (
        <div
          className="sticky top-[68px] z-10 flex items-start gap-2 px-4 py-2 text-[11px] font-semibold"
          style={{
            background: hazard.level === "critical" ? "rgba(239,68,68,0.18)" : "rgba(245,165,36,0.16)",
            borderBottom: `1px solid ${hazard.level === "critical" ? "var(--crit)" : "var(--warn)"}`,
            color: hazard.level === "critical" ? "#ffb4b4" : "#ffd79a",
          }}
          role="alert"
        >
          <span aria-hidden>{hazard.level === "critical" ? "🚨" : "⚠️"}</span>
          <div className="flex-1">
            <p className="uppercase tracking-wide">{hazard.label}</p>
            {hazard.reasons.length ? <p className="mt-0.5 font-normal opacity-90">{hazard.reasons.join(" · ")}</p> : null}
          </div>
          <button onClick={dismissBanner} className="ms-muted px-1 text-xs" aria-label="Dismiss banner">
            ✕
          </button>
        </div>
      ) : null}

      <main className="flex-1 px-4 pb-28 pt-3">{children}</main>

      {user.role === "worker" || user.role === "supervisor" ? (
        <button
          onClick={sendSos}
          disabled={sosState !== "idle"}
          className={`fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full px-6 py-3 text-sm font-extrabold uppercase tracking-widest shadow-lg shadow-black/50 ${
            sosState === "idle" ? "bg-gradient-to-b from-[#ef4444] to-[#991b1b] text-white ms-pulse" : "bg-[var(--surface-3)] text-[var(--muted)]"
          }`}
          aria-label="Send emergency SOS alert"
        >
          {sosState === "idle" ? "SOS" : sosState === "sending" ? "Sending…" : "SOS sent ✓"}
        </button>
      ) : null}

      <nav
        className="fixed bottom-0 left-1/2 z-20 w-full max-w-[460px] -translate-x-1/2 border-t border-[var(--border)] bg-[rgba(9,14,23,0.97)] px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur"
        aria-label="Main navigation"
      >
        <ul className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-semibold ${
                    active ? "text-[var(--accent)]" : "text-[var(--muted)]"
                  }`}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                  {item.href === "/alerts" && criticalOpen.length ? (
                    <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-[var(--crit)]" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="px-4 pb-2 pt-1 text-center">
        <Pill tone="info" className="!text-[9px]">
          {snapshot?.simulatorEnabled ? "Simulated data feed ON" : "Simulated feed OFF"}
        </Pill>
      </footer>
    </div>
  );
}
