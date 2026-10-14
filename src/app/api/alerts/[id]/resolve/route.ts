import { EngineError, resolveAlert } from "@/lib/safety/engine";
import { fail, ok, parseJson, requireUser } from "@/lib/http";
import { resolveSchema } from "@/lib/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["supervisor", "admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) return fail("Invalid alert id", 400);

  const parsed = await parseJson(request, resolveSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const alert = await resolveAlert(alertId, auth.session.uid, parsed.data.resolutionNotes);
    return ok({
      alert: {
        id: alert.id,
        status: alert.status,
        resolvedAt: alert.resolvedAt,
        resolutionNotes: alert.resolutionNotes,
      },
    });
  } catch (err) {
    if (err instanceof EngineError) return fail(err.message, err.status);
    return fail("Failed to resolve alert", 500);
  }
}


