import { requireUser } from "@/lib/http";
import { listAlerts, type AlertFilter } from "@/lib/queries";
import { evaluateHelmetConnections } from "@/lib/safety/engine";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const severity = url.searchParams.get("severity") ?? "all";
  const type = url.searchParams.get("type") ?? "all";
  const search = url.searchParams.get("q") ?? undefined;
  const limit = Math.min(300, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

  if (url.searchParams.get("runOfflineCheck") === "1") {
    await evaluateHelmetConnections();
  }

  const filter: AlertFilter = {
    status: status as AlertFilter["status"],
    severity: severity as AlertFilter["severity"],
    type,
    search,
    limit,
  };
  const alerts = await listAlerts(filter);
  return Response.json(
    {
      count: alerts.length,
      counts: {
        active: alerts.filter((a) => a.status === "active").length,
        acknowledged: alerts.filter((a) => a.status === "acknowledged").length,
        resolved: alerts.filter((a) => a.status === "resolved").length,
        critical: alerts.filter((a) => a.severity === "critical" && a.status !== "resolved").length,
      },
      alerts,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
