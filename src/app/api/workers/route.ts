import { eq } from "drizzle-orm";
import { db } from "@/db";
import { helmets, users, workers } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { fail, ok, parseJson, requireUser } from "@/lib/http";
import { listWorkersWithStatus } from "@/lib/queries";
import { workerSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  let list = await listWorkersWithStatus();
  if (!includeInactive) list = list.filter((w) => w.active);
  return Response.json({ count: list.length, workers: list }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin", "supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, workerSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  let helmetId: number | null = null;
  if (body.helmetCode) {
    const found = await db.select().from(helmets).where(eq(helmets.code, body.helmetCode));
    if (!found[0]) return fail(`Helmet ${body.helmetCode} is not registered`, 404);
    helmetId = found[0].id;
  }

  const code =
    body.code?.toUpperCase() ??
    `WORKER-${String((await db.select({ id: workers.id }).from(workers)).length + 1).padStart(3, "0")}`;

  const existing = await db.select().from(workers).where(eq(workers.code, code));
  if (existing[0]) return fail(`Worker ${code} already exists`, 409);

  const created = await db
    .insert(workers)
    .values({
      code,
      fullName: body.fullName,
      department: body.department ?? "General",
      zone: body.zone ?? "Zone-A",
      phone: body.phone ?? null,
      shift: body.shift ?? "Day",
      helmetId,
      active: body.active ?? true,
    })
    .returning();

  // Optionally provision a mobile login for the new worker.
  const provisionLogin = new URL(request.url).searchParams.get("provisionLogin") === "1";
  let credentials: { username: string; tempPassword: string } | null = null;
  if (provisionLogin) {
    const username = code.toLowerCase();
    const tempPassword = `Mine@${Math.random().toString(36).slice(2, 8)}`;
    await db
      .insert(users)
      .values({
        username,
        passwordHash: hashPassword(tempPassword),
        role: "worker",
        fullName: body.fullName,
        workerCode: code,
      })
      .onConflictDoNothing();
    credentials = { username, tempPassword };
  }

  return ok({ worker: created[0], credentials }, 201);
}
