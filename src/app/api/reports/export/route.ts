import { requireUser } from "@/lib/http";
import { listAlerts } from "@/lib/queries";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

/** CSV export of the incident history (honours the same filters as /api/alerts). */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "all") as "all";
  const severity = (url.searchParams.get("severity") ?? "all") as "all";
  const type = url.searchParams.get("type") ?? "all";
  const search = url.searchParams.get("q") ?? undefined;

  const rows = await listAlerts({ status, severity, type, search, limit: 300 });

  const header = [
    "alert_id",
    "created_at",
    "type",
    "severity",
    "status",
    "detector",
    "rule_id",
    "helmet",
    "worker",
    "worker_name",
    "zone",
    "measured_value",
    "threshold",
    "unit",
    "data_source",
    "acknowledged_at",
    "ack_seconds",
    "resolved_at",
    "resolve_seconds",
    "acknowledgement_note",
    "resolution_notes",
    "message",
  ];

  const lines = [header.join(",")];
  for (const a of rows) {
    lines.push(
      [
        a.id,
        a.createdAt,
        a.type,
        a.severity,
        a.status,
        a.detector,
        a.ruleId,
        a.helmetCode,
        a.workerCode,
        a.workerName,
        a.zone,
        a.measuredValue,
        a.threshold,
        a.unit,
        a.snapshot?.source ?? "unknown",
        a.acknowledgedAt,
        a.ackSeconds,
        a.resolvedAt,
        a.resolveSeconds,
        a.acknowledgementNote,
        a.resolutionNotes,
        a.message,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const filename = `minesafe-incident-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
