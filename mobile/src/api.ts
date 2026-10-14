/**
 * API client for the MineSafe AI backend.
 * Real-data mode only: when `simulated` is false the app calls these
 * functions; when true, screens use mobile/src/simulated.ts instead and
 * display a SIMULATED banner.
 */
import { API_BASE_URL } from "./config";
import { Session, Role } from "./config";
import { Reading, Alert, Worker, Helmet, Thresholds } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, session: Session | null, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || `Request failed (${res.status})`);
  }
  return (res.status === 204 ? (undefined as T) : ((await res.json()) as T));
}

export const api = {
  login: (u: string, p: string) =>
    request<Session>(`/api/auth/login`, null, { method: "POST", body: JSON.stringify({ username: u, password: p }) }),

  latestReadings: (s: Session) => request<Reading[]>(`/api/readings/latest`, s),
  alerts: (s: Session, state?: string) => request<Alert[]>(`/api/alerts${state ? `?state=${state}` : ""}`, s),
  acknowledgeAlert: (s: Session, id: string) => request<Alert>(`/api/alerts/${id}/acknowledge`, s, { method: "POST" }),
  resolveAlert: (s: Session, id: string, notes: string) =>
    request<Alert>(`/api/alerts/${id}/resolve`, s, { method: "POST", body: JSON.stringify({ notes }) }),
  raiseSos: (s: Session, workerId: string | null, helmetId: string | null) =>
    request<Alert>(`/api/sos`, s, { method: "POST", body: JSON.stringify({ workerId, helmetId }) }),

  workers: (s: Session) => request<Worker[]>(`/api/workers`, s),
  helmets: (s: Session) => request<Helmet[]>(`/api/helmets`, s),
  thresholds: (s: Session) => request<Thresholds>(`/api/thresholds`, s),
  updateThresholds: (s: Session, t: Thresholds) => request<Thresholds>(`/api/thresholds`, s, { method: "PUT", body: JSON.stringify(t) }),

  registerPushToken: (s: Session, token: string, platform: string) =>
    request<{ ok: boolean }>(`/api/notifications/register`, s, { method: "POST", body: JSON.stringify({ token, platform }) }),
};

export type { Role };
