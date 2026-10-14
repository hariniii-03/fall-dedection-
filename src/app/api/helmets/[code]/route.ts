import { eq } from "drizzle-orm";
import { db } from "@/db";
import { helmets } from "@/db/schema";
import { fail, ok, parseJson, requireUser } from "@/lib/http";
import { getHelmetViews, getReadingSeries } from "@/lib/queries";
import { helmetSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { code } = await context.params;
  const view = (await getHelmetViews()).find((h) => h.code === code.toUpperCase());
  if (!view) return fail(`Helmet ${code} not found`, 404);
  const series = await getReadingSeries(view.code, 60);
  return Response.json({ helmet: view, series }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireUser(["admin"]);
  if (!auth.ok) return auth.response;
  const { code } = await context.params;
  const parsed = await parseJson(request, helmetSchema.partial());
  if (!parsed.ok) return parsed.response;

  const rows = await db.select().from(helmets).where(eq(helmets.code, code.toUpperCase()));
  const helmet = rows[0];
  if (!helmet) return fail(`Helmet ${code} not found`, 404);

  const sensors = { ...(helmet.sensors as Record<string, boolean>), ...(parsed.data.sensors ?? {}) };
  const updated = await db
    .update(helmets)
    .set({
      firmwareVersion: parsed.data.firmwareVersion ?? helmet.firmwareVersion,
      gasSensorModel: parsed.data.gasSensorModel ?? helmet.gasSensorModel,
      sensors: sensors as typeof helmet.sensors,
      active: parsed.data.code ? helmet.active : helmet.active,
    })
    .where(eq(helmets.id, helmet.id))
    .returning();
  return ok({ helmet: updated[0] });
}
