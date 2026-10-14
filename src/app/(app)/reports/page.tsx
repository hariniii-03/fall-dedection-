import { getReportSummary } from "@/lib/queries";
import { ReportsClient } from "@/components/ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600 * 1000);
  const summary = await getReportSummary(from.toISOString(), to.toISOString());
  return <ReportsClient initial={summary} />;
}
