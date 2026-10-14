import { z } from "zod";
import { acknowledgeAlert, EngineError } from "@/lib/safety/engine";
import { canAcknowledgeAlerts } from "@/lib/auth";
import { fail, ok, parseJson, requireUser } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["supervisor", "admin"]);
  if (!auth.ok) return auth.response;
  if (!canAcknowledgeAlerts(auth.session.role)) return fail("Forbidden", 403);

  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) return fail("Invalid alert id", 400);

  const parsed = await parseJson(request, z.object({ note: z.string().max(500).optional() }));
  if (!parsed.ok) return parsed.response;

  try {
    const alert = await acknowledgeAlert(alertId, auth.session.uid, parsed.data.note);
    return ok({
      alert: {
        id: alert.id,
        status: alert.status,
        acknowledgedAt: alert.acknowledgedAt,
        acknowledgementNote: alert.acknowledgementNote,
      },
    });
  } catch (err) {
    if (err instanceof EngineError) return fail(err.message, err.status);
    return fail("Failed to acknowledge alert", 500);
  }
}
