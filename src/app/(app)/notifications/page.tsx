import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listNotifications } from "@/lib/queries";
import { NotificationsClient, type NotificationItem } from "@/components/NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const rows = await listNotifications(session.uid);
  const items: NotificationItem[] = rows.map((r) => ({
    id: r.id,
    alertId: r.alertId,
    title: r.title,
    body: r.body,
    priority: r.priority,
    channel: r.channel,
    deliveryStatus: r.deliveryStatus,
    deliveryDetail: r.deliveryDetail,
    readAt: r.readAt,
    createdAt: r.createdAt,
    alertStatus: r.alertStatus,
    alertSeverity: r.alertSeverity,
  }));
  return <NotificationsClient initial={items} />;
}
