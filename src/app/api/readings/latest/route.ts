import { requireUser } from "@/lib/http";
import { getHelmetViews } from "@/lib/queries";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const code = new URL(request.url).searchParams.get("helmet");
  const views = await getHelmetViews();
  const data = code ? views.filter((v) => v.code === code) : views;
  if (code && data.length === 0) {
    return Response.json({ error: `Helmet ${code} not found` }, { status: 404 });
  }
  return Response.json({ readings: data, serverTime: new Date().toISOString() }, {
    headers: { "cache-control": "no-store" },
  });
}
