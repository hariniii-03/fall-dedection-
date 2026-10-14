import { db } from "@/db";
import { helmets } from "@/db/schema";
import { fail, ok, parseJson, requireUser, verifyDeviceKey } from "@/lib/http";
import { getHelmetViews } from "@/lib/queries";
import { helmetSchema } from "@/lib/validation";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const views = await getHelmetViews();
  return Response.json({ count: views.length, helmets: views }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (!auth.ok) return auth.response;
  if (!verifyDeviceKey(request) && auth.session.role !== "admin") return fail("Forbidden", 403);

  const parsed = await parseJson(request, helmetSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const created = await db
    .insert(helmets)
    .values({
      code: body.code.toUpperCase(),
      firmwareVersion: body.firmwareVersion ?? "esp32-s3-1.0.0",
      gasSensorModel: body.gasSensorModel ?? "MQ-135",
      sensors: {
        gas: body.sensors?.gas ?? true,
        temperature: body.sensors?.temperature ?? true,
        humidity: body.sensors?.humidity ?? true,
        accelerometer: body.sensors?.accelerometer ?? true,
        pressure: body.sensors?.pressure ?? false,
        battery: body.sensors?.battery ?? true,
      },
      dataSource: "device",
    })
    .onConflictDoNothing()
    .returning();

  if (!created[0]) return fail(`Helmet ${body.code} already exists`, 409);
  return ok({ helmet: created[0] }, 201);
}
