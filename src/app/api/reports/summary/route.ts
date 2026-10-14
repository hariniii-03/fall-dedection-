import { fail, requireUser } from "@/lib/http";
import { getReportSummary } from "@/lib/queries";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
  const fromParam = url.searchParams.get("from");
  const preset = url.searchParams.get("range");

  let from: Date;
  if (fromParam) {
    from = new Date(fromParam);
  } else if (preset === "weekly") {
    from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  } else if (preset === "monthly") {
    from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  } else {
    from = new Date(to.getTime() - 24 * 3600 * 1000);
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fail("Invalid date range", 422);
  }
  if (from >= to) return fail("`from` must be earlier than `to`", 422);

  const summary = await getReportSummary(from.toISOString(), to.toISOString());
  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}
