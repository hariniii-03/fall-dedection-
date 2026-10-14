import { z } from "zod";
import { fail, ok, parseJson, requireUser } from "@/lib/http";
import { markNotificationsRead } from "@/lib/notifications";
import { listNotifications, getUnreadNotificationCount } from "@/lib/queries";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const priority = url.searchParams.get("priority");
  const unreadOnly = url.searchParams.get("unread") === "1";
  let rows = await listNotifications(auth.session.uid);
  if (priority && priority !== "all") rows = rows.filter((r) => r.priority === priority);
  if (unreadOnly) rows = rows.filter((r) => !r.readAt);
  return Response.json(
    { unread: await getUnreadNotificationCount(auth.session.uid), count: rows.length, notifications: rows },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJson(request, z.object({ ids: z.array(z.number().int()).optional() }));
  if (!parsed.ok) return parsed.response;
  const updated = await markNotificationsRead(auth.session.uid, parsed.data.ids);
  return ok({ markedRead: updated, unread: await getUnreadNotificationCount(auth.session.uid) });
}

export async function DELETE() {
  return fail("Notification history is retained for audit purposes and cannot be deleted", 405);
}
