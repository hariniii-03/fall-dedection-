import { requireUser } from "@/lib/http";
import { getDashboardSnapshot } from "@/lib/queries";
import { evaluateHelmetConnections } from "@/lib/safety/engine";
import { tickSimulator } from "@/lib/simulator";
import { ensureSeeded } from "@/lib/seed";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  await ensureSeeded();

  const url = new URL(request.url);
  if (url.searchParams.get("advance") !== "0") {
    await tickSimulator();
    await evaluateHelmetConnections();
  }
  const snapshot = await getDashboardSnapshot();
  return Response.json(snapshot, {
    headers: { "cache-control": "no-store" },
  });
}
