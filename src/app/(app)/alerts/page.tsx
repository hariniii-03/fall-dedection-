import { canAcknowledgeAlerts, getSession } from "@/lib/auth";
import { listAlerts } from "@/lib/queries";
import { AlertsClient } from "@/components/AlertsClient";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await getSession();
  const alerts = await listAlerts({ limit: 200 });
  return <AlertsClient initialAlerts={alerts} canAct={session ? canAcknowledgeAlerts(session.role) : false} />;
}
