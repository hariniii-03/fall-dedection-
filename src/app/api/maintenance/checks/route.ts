/**
 * Cron-friendly watchdog endpoint:
 *   POST /api/maintenance/checks   (or GET with the CRON_SECRET header)
 *
 * Runs the offline-helmet detection pass so alerts are still raised when no
 * dashboard/SSE client is connected.
 */
import { fail, ok, verifyDeviceKey } from "@/lib/http";
import { evaluateHelmetConnections } from "@/lib/safety/engine";

async function run() {
  const result = await evaluateHelmetConnections();
  return ok({ ranAt: new Date().toISOString(), ...result });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) {
    return fail("Invalid cron secret", 401);
  }
  if (!secret && !verifyDeviceKey(request)) return fail("Invalid device key", 401);
  return run();
}

export async function POST(request: Request) {
  return GET(request);
}
