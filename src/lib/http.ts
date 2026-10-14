/**
 * Shared HTTP helpers for route handlers: JSON responses, zod validation,
 * authentication guards, basic in-memory rate limiting and error logging.
 */
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { db } from "@/db";
import { eventLogs } from "@/db/schema";
import { getSession, type Role, type SessionPayload } from "@/lib/auth";

export type ApiError = { error: string; details?: unknown };

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data as object, { status: init ?? 200 });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details } satisfies ApiError, { status });
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<
  { ok: true; data: T } | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail("Request body must be valid JSON", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: fail("Validation failed", 422, parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }))),
    };
  }
  return { ok: true, data: parsed.data };
}

export async function requireUser(roles?: Role[]): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) return { ok: false, response: fail("Authentication required", 401) };
  if (roles && !roles.includes(session.role)) {
    return { ok: false, response: fail("Forbidden for role " + session.role, 403) };
  }
  return { ok: true, session };
}

/** Device ingest authentication: shared secret header set on the ESP32-S3. */
export function verifyDeviceKey(request: Request): boolean {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected) return true; // open in dev, documented in README
  const provided =
    request.headers.get("x-device-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return provided === expected;
}

/**
 * Stronger device authentication for endpoints that must NOT fall back to
 * "any anonymous caller" (e.g. the SOS endpoint).
 *
 * Returns true when:
 *  - DEVICE_API_KEY is configured on the server AND the header matches, or
 *  - DEVICE_API_KEY is intentionally unconfigured (development) AND the device
 *    actually presented an `x-device-key` header, proving it is the firmware and
 *    not a stray browser request.
 */
export function isDeviceAuthenticated(request: Request): boolean {
  const provided =
    request.headers.get("x-device-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!provided) return false;

  const expected = process.env.DEVICE_API_KEY;
  if (!expected) return true; // dev mode: header present, no secret configured
  return provided === expected;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function clientKey(request: Request, scope: string): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  return `${scope}:${ip}`;
}

export async function logEvent(
  level: "info" | "warn" | "error",
  source: string,
  message: string,
  meta: Record<string, unknown> = {},
) {
  try {
    await db.insert(eventLogs).values({ level, source, message, meta });
  } catch (err) {
    console.error("[minesafe] failed to persist event log", message, err);
  }
}
