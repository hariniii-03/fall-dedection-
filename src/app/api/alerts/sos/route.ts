import { fail, ok, parseJson, rateLimit, clientKey, isDeviceAuthenticated, logEvent } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { raiseSosAlert } from "@/lib/safety/engine";
import { sosSchema } from "@/lib/validation";

/**
 * Emergency SOS.
 *
 * Two authentication paths:
 *  1. A signed-in user (worker / supervisor / admin) from the mobile or web app.
 *     A worker is always bound to their own workerCode.
 *  2. The ESP32-S3 helmet, authenticated with the `x-device-key` header. The
 *     helmet has no user session, so it identifies itself via `helmetCode` and
 *     the wearer via `workerCode`.
 *
 * See esp32-firmware/http/ for the firmware that calls this endpoint.
 */
export async function POST(request: Request) {
  const deviceAuthenticated = isDeviceAuthenticated(request);
  const session = await getSession();

  if (!deviceAuthenticated && !session) {
    return fail("Authentication required", 401);
  }
  if (!rateLimit(clientKey(request, "sos"), 30, 60_000)) {
    return fail("SOS rate limit exceeded", 429);
  }

  const parsed = await parseJson(request, sosSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Workers can only raise an SOS for themselves; supervisors/admins and the
  // helmet may act on behalf of any worker.
  const effectiveWorkerCode =
    session?.role === "worker"
      ? (session.workerCode ?? body.workerCode)
      : body.workerCode;

  const { alert, deliveries } = await raiseSosAlert({
    workerCode: effectiveWorkerCode,
    helmetCode: body.helmetCode,
    location: body.location ?? null,
    note: body.note,
    source: deviceAuthenticated ? "device" : body.source,
  });

  if (deviceAuthenticated) {
    await logEvent("error", "sos", "SOS raised from helmet hardware", {
      alertId: alert.id,
      helmetCode: body.helmetCode ?? null,
      workerCode: effectiveWorkerCode ?? null,
    });
  }

  return ok(
    {
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        message: alert.message,
        createdAt: alert.createdAt,
      },
      deliveries,
    },
    201,
  );
}
