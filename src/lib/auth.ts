/**
 * Authentication + role based authorization.
 *
 * - Passwords: scrypt with per-user random salt (never stored in plaintext).
 * - Sessions: stateless HMAC-signed cookie (`ms_session`), secret comes from
 *   APP_SECRET env var. No API key or secret is ever bundled into the client.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

export const SESSION_COOKIE = "ms_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

export type Role = "worker" | "supervisor" | "admin";

export type SessionPayload = {
  uid: number;
  username: string;
  role: Role;
  fullName: string;
  workerCode: string | null;
  exp: number;
};

function secret(): string {
  return process.env.APP_SECRET ?? "minesafe-dev-secret-change-me";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const derived = scryptSync(password, parts[1], 64);
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function signSession(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed?.uid || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Cookie options for the session cookie.
 *
 * `secure: true` tells the browser to only send the cookie over HTTPS. That is
 * correct in production, but when the app is served over plain HTTP (a local
 * `npm run dev`, a LAN IP, or an HTTP-proxied preview) a `Secure` cookie is
 * SILENTLY DISCARDED by the browser, which makes sign-in appear to do nothing:
 * the API returns 200, the cookie is dropped, and the middleware-less layout
 * redirect straight back to /login.
 *
 * So we detect the real request protocol instead of assuming it, and allow an
 * explicit override with COOKIE_SECURE=true|false.
 */
export function sessionCookieOptions(secure = false) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Best-effort detection of the client-facing protocol (proxy aware). */
export function isSecureRequest(request: Request): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0].trim() === "https";
  }
  const forwardedSsl = request.headers.get("x-forwarded-ssl");
  if (forwardedSsl === "on") return true;

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function authenticate(username: string, password: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase()));
  const user = rows[0];
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return user;
}

export const ROLE_HOME: Record<Role, string> = {
  admin: "/dashboard",
  supervisor: "/dashboard",
  worker: "/dashboard",
};

export function canManageWorkers(role: Role): boolean {
  return role === "admin" || role === "supervisor";
}

export function canConfigureSafety(role: Role): boolean {
  return role === "admin";
}

export function canAcknowledgeAlerts(role: Role): boolean {
  return role === "admin" || role === "supervisor";
}
