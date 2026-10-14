import { SecureStore } from "expo-secure-store";
import { Session, API_BASE_URL } from "./config";

const SESSION_KEY = "minesafe.session";

export async function saveSession(s: Session): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(s));
}

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export interface LoginResult {
  ok: boolean;
  session?: Session;
  error?: string;
}

/** Logs in against the backend. Rejects empty input before any network call. */
export async function login(username: string, password: string): Promise<LoginResult> {
  if (!username.trim() || !password) return { ok: false, error: "Enter username and password." };
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 401) return { ok: false, error: "Invalid username or password." };
    if (!res.ok) return { ok: false, error: `Login failed (${res.status}).` };
    const data = (await res.json()) as Session;
    if (!data.token || !data.role) return { ok: false, error: "Malformed login response." };
    await saveSession(data);
    return { ok: true, session: data };
  } catch {
    return { ok: false, error: "Cannot reach the server. Check your connection and API_BASE_URL." };
  }
}
