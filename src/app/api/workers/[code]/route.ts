import { eq } from "drizzle-orm";
import { db } from "@/db";
import { helmets, users, workers } from "@/db/schema";
import { fail, ok, parseJson, requireUser } from "@/lib/http";
import { getWorkerDetail } from "@/lib/queries";
import { workerSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { code } = await context.params;
  const detail = await getWorkerDetail(code);
  if (!detail) return fail(`Worker ${code} not found`, 404);
  return Response.json(detail, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireUser(["admin", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { code } = await context.params;

  const parsed = await parseJson(request, workerSchema.partial());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const rows = await db.select().from(workers).where(eq(workers.code, code));
  const worker = rows[0];
  if (!worker) return fail(`Worker ${code} not found`, 404);

  let helmetId = worker.helmetId;
  if (body.helmetCode !== undefined) {
    if (body.helmetCode === null || body.helmetCode === "") {
      helmetId = null;
    } else {
      const found = await db.select().from(helmets).where(eq(helmets.code, body.helmetCode));
      if (!found[0]) return fail(`Helmet ${body.helmetCode} is not registered`, 404);
      helmetId = found[0].id;
    }
  }

  const updated = await db
    .update(workers)
    .set({
      fullName: body.fullName ?? worker.fullName,
      department: body.department ?? worker.department,
      zone: body.zone ?? worker.zone,
      phone: body.phone === undefined ? worker.phone : body.phone,
      shift: body.shift ?? worker.shift,
      helmetId,
      active: body.active ?? worker.active,
    })
    .where(eq(workers.id, worker.id))
    .returning();

  if (body.active === false) {
    await db.update(users).set({ active: false }).where(eq(users.workerCode, code));
  }

  return ok({ worker: updated[0] });
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireUser(["admin"]);
  if (!auth.ok) return auth.response;
  const { code } = await context.params;
  const rows = await db.select().from(workers).where(eq(workers.code, code));
  const worker = rows[0];
  if (!worker) return fail(`Worker ${code} not found`, 404);

  // Soft-deactivate: incident history must never be lost.
  await db.update(workers).set({ active: false, helmetId: null }).where(eq(workers.id, worker.id));
  await db.update(users).set({ active: false }).where(eq(users.workerCode, code));
  return ok({ worker: { code, active: false }, note: "Worker deactivated; history preserved." });
}
