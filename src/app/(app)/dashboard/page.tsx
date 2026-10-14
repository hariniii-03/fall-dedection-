import { getDashboardSnapshot } from "@/lib/queries";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const snapshot = await getDashboardSnapshot();
  return <DashboardClient initial={snapshot} />;
}
