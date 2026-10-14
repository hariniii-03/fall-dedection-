import { getSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getUnreadNotificationCount } from "@/lib/queries";

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Not authenticated", 401);
  const unread = await getUnreadNotificationCount(session.uid);
  return ok({
    user: {
      id: session.uid,
      username: session.username,
      role: session.role,
      fullName: session.fullName,
      workerCode: session.workerCode,
    },
    unreadNotifications: unread,
  });
}
