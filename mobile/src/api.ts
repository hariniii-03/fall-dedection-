/**
 * MineSafe AI mobile API client.
 *
 * The base URL comes from app.json `extra.apiBaseUrl` (set it to your PC's LAN
 * IP when testing on a physical device, e.g. http://192.168.1.50:3000).
 * No API key, password or secret is hard-coded in the app bundle: the app only
 * ever holds a short-lived session cookie returned by /api/auth/login.
 */
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "minesafe.session.token";

export const API_BASE_URL: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "http://10.0.2.2:3000";

export type Role = "worker" | "supervisor" | "admin";

export type SessionUser = {
  id: number;
  username: string;
  role: Role;
  fullName: string;
  workerCode: string | null;
};

export type AlertView = {
  id: number;
  type: string;
  severity: "critical" | "warning" | "info";
  status: "active" | "acknowledged" | "resolved";
  title: string;
  message: string;
  explanation: string | null;
  detector: string;
  ruleId: string | null;
  measuredValue: number | null;
  threshold: number | null;
  unit: string | null;
  helmetCode: string | null;
  workerCode: string | null;
  workerName: string | null;
  createdAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  ackSeconds: number | null;
  resolveSeconds: number | null;
  resolutionNotes: string | null;
  source: string;
};

export type HelmetView = {
  code: string;
  connectionState: "online" | "stale" | "offline";
  safetyStatus: "normal" | "warning" | "critical" | "offline";
  batteryPercent: number | null;
  lastReadingAt: string | null;
  workerCode: string | null;
  workerName: string | null;
  zone: string | null;
  dataSource: string;
  latest: {
    gasRaw: number | null;
    temperatureC: number | null;
    humidityPercent: number | null;
    accelMagnitudeG: number | null;
    batteryPercent: number | null;
    anomalyLabel: string | null;
    source: string;
    receivedAt: string | null;
  } | null;
};

export type DashboardSnapshot = {
  generatedAt: string;
  simulatorEnabled: boolean;
  totals: {
    workers: number;
    monitored: number;
    safe: number;
    warning: number;
    critical: number;
    offlineHelmets: number;
    activeAlerts: number;
    criticalAlerts: number;
  };
  hazard: { level: "normal" | "warning" | "critical"; label: string; reasons: string[] };
  helmets: HelmetView[];
  latestAlerts: AlertView[];
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok) {
    const message = (json as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

export const api = {
  async login(username: string, password: string, role: Role): Promise<SessionUser> {
    const data = await request<{ user: SessionUser; token?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    });
    if (data.token) await AsyncStorage.setItem(TOKEN_KEY, data.token);
    return data.user;
  },
  logout() {
    return AsyncStorage.removeItem(TOKEN_KEY);
  },
  dashboard() {
    return request<DashboardSnapshot>("/api/dashboard?advance=0");
  },
  alerts(status: "all" | "active" | "acknowledged" | "resolved" = "all") {
    return request<{ alerts: AlertView[]; counts: Record<string, number> }>(
      `/api/alerts?status=${status}&limit=100`,
    );
  },
  acknowledge(id: number, note?: string) {
    return request(`/api/alerts/${id}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },
  resolve(id: number, resolutionNotes: string) {
    return request(`/api/alerts/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolutionNotes }),
    });
  },
  sos(payload: { workerCode?: string; note?: string }) {
    return request("/api/alerts/sos", { method: "POST", body: JSON.stringify(payload) });
  },
  workers() {
    return request<{ workers: unknown[] }>("/api/workers");
  },
  helmets() {
    return request<{ helmets: HelmetView[] }>("/api/helmets");
  },
  thresholds() {
    return request<{ thresholds: Record<string, unknown> }>("/api/settings/thresholds");
  },
  updateThresholds(payload: Record<string, unknown>) {
    return request("/api/settings/thresholds", { method: "PUT", body: JSON.stringify(payload) });
  },
  registerPushToken(token: string, platform: "android" | "ios" | "web" = "android") {
    return request("/api/notifications/register", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    });
  },
  notifications() {
    return request<{ notifications: unknown[]; unread: number }>("/api/notifications");
  },
  markNotificationsRead() {
    return request("/api/notifications", { method: "PATCH", body: JSON.stringify({}) });
  },
  report(range: "daily" | "weekly" | "monthly") {
    return request<Record<string, unknown>>(`/api/reports/summary?range=${range}`);
  },
  history(helmet: string, limit = 60) {
    return request<{ series: Record<string, number | null>[] }>(
      `/api/readings/history?helmet=${encodeURIComponent(helmet)}&limit=${limit}`,
    );
  },
};
