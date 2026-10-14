"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardSnapshot } from "@/lib/queries";

export type ConnectionState = "connecting" | "live" | "polling" | "offline";

type LiveContextValue = {
  snapshot: DashboardSnapshot | null;
  connection: ConnectionState;
  stale: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  dismissBanner: () => void;
  bannerDismissed: boolean;
};

const LiveContext = createContext<LiveContextValue>({
  snapshot: null,
  connection: "connecting",
  stale: false,
  lastError: null,
  refresh: async () => {},
  dismissBanner: () => {},
  bannerDismissed: false,
});

export function useLive() {
  return useContext(LiveContext);
}

/**
 * Live data provider.
 *
 * Primary transport: Server-Sent Events (`/api/stream`).
 * Fallback: polling `/api/dashboard` if the stream drops, so the UI keeps
 * working on flaky mine networks. Stale readings are always shown with their
 * original timestamp and a "stale" marker - never presented as live data.
 */
export function LiveProvider({
  initialSnapshot,
  children,
}: {
  initialSnapshot: DashboardSnapshot | null;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialSnapshot);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const seenAlertIds = useRef<Set<number>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard?advance=0", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DashboardSnapshot;
      setSnapshot(data);
      setLastError(null);
    } catch (err) {
      setLastError(String(err));
    }
  }, []);

  // Local notification fallback + in-app toasts for newly arriving alerts.
  const handleSnapshot = useCallback((next: DashboardSnapshot) => {
    setSnapshot((previous) => {
      if (previous) {
        for (const alert of next.latestAlerts) {
          if (!seenAlertIds.current.has(alert.id) && previous.latestAlerts.every((a) => a.id !== alert.id)) {
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try {
                new Notification(alert.title, {
                  body: alert.message,
                  tag: `minesafe-alert-${alert.id}`,
                });
                if (alert.severity === "critical" && "vibrate" in navigator) {
                  navigator.vibrate?.([200, 100, 200]);
                }
              } catch {
                /* notification API unavailable */
              }
            }
          }
          seenAlertIds.current.add(alert.id);
        }
      } else {
        for (const alert of next.latestAlerts) seenAlertIds.current.add(alert.id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startPolling = () => {
      if (pollRef.current) return;
      setConnection("polling");
      pollRef.current = setInterval(() => {
        void refresh();
      }, 5000);
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      try {
        const source = new EventSource("/api/stream");
        sourceRef.current = source;
        source.addEventListener("snapshot", (event) => {
          stopPolling();
          setConnection("live");
          try {
            handleSnapshot(JSON.parse((event as MessageEvent).data) as DashboardSnapshot);
          } catch {
            /* ignore malformed frame */
          }
        });
        source.onerror = () => {
          source.close();
          sourceRef.current = null;
          startPolling();
          // Retry the stream after a short backoff (network reconnection).
          setTimeout(() => {
            if (!cancelled && !sourceRef.current) connect();
          }, 10_000);
        };
      } catch {
        startPolling();
      }
    };

    connect();

    const staleTimer = setInterval(() => {
      const generatedAt = snapshotRef.current?.generatedAt;
      setStale(!generatedAt || Date.now() - new Date(generatedAt).getTime() > 12_000);
    }, 3000);

    return () => {
      cancelled = true;
      stopPolling();
      clearInterval(staleTimer);
      sourceRef.current?.close();
    };
  }, [handleSnapshot, refresh]);

  const snapshotRef = useRef<DashboardSnapshot | null>(snapshot);
  snapshotRef.current = snapshot;

  const value = useMemo<LiveContextValue>(
    () => ({
      snapshot,
      connection,
      stale,
      lastError,
      refresh,
      dismissBanner: () => setBannerDismissed(true),
      bannerDismissed,
    }),
    [snapshot, connection, stale, lastError, refresh, bannerDismissed],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
