import { NextResponse } from "next/server";
import {
  authenticate,
  isSecureRequest,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  type Role,
} from "@/lib/auth";
import { clientKey, fail, rateLimit } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { ensureSeeded } from "@/lib/seed";
import { parseJson } from "@/lib/http";

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "login"), 15, 60_000)) {
    return fail("Too many login attempts. Try again in a minute.", 429);
  }
  await ensureSeeded();

  const parsed = await parseJson(request, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { username, password, role } = parsed.data;

  const user = await authenticate(username, password);
  if (!user) return fail("Invalid username or password", 401);
  if (role && user.role !== role) {
    return fail(`This account is registered as "${user.role}". Select the correct role.`, 403);
  }

  const payload = {
    uid: user.id,
    username: user.username,
    role: user.role as Role,
    fullName: user.fullName,
    workerCode: user.workerCode,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  };

  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      workerCode: user.workerCode,
    },
  });
  // `Secure` is only set for real HTTPS requests, otherwise browsers drop the
  // cookie over HTTP and sign-in silently fails (redirects back to /login).
  response.cookies.set(SESSION_COOKIE, signSession(payload), sessionCookieOptions(isSecureRequest(request)));
  return response;
}

export async function GET() {
  return fail("Use POST to sign in", 405);
}
