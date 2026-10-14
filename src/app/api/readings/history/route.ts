import { requireUser } from "@/lib/http";
import { getReadingSeries } from "@/lib/queries";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const helmet = url.searchParams.get("helmet") ?? "HELMET-001";
  const limit = Math.min(500, Math.max(5, Number(url.searchParams.get("limit") ?? 60)));
  const series = await getReadingSeries(helmet, limit);
  if (!series) return Response.json({ error: `Helmet ${helmet} not found` }, { status: 404 });
  return Response.json(series, { headers: { "cache-control": "no-store" } });
}
