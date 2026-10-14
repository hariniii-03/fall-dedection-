import { notFound } from "next/navigation";
import { canAcknowledgeAlerts, getSession } from "@/lib/auth";
import { getAlertDetail } from "@/lib/queries";
import { AlertDetailClient } from "@/components/AlertDetailClient";

export const dynamic = "force-dynamic";

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) notFound();

  const alert = await getAlertDetail(alertId);
  if (!alert) notFound();

  const session = await getSession();
  return <AlertDetailClient alert={alert} canAct={session ? canAcknowledgeAlerts(session.role) : false} />;
}
