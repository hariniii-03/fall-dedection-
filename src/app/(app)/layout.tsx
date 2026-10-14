import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { getDashboardSnapshot, getUnreadNotificationCount } from "@/lib/queries";
import { AppShell, type ShellUser } from "@/components/AppShell";
import { LiveProvider } from "@/components/LiveProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await ensureSeeded();
  const session = await getSession();
  if (!session) redirect("/login");

  const [snapshot, unread] = await Promise.all([
    getDashboardSnapshot(),
    getUnreadNotificationCount(session.uid),
  ]);

  const user: ShellUser = {
    id: session.uid,
    username: session.username,
    role: session.role,
    fullName: session.fullName,
    workerCode: session.workerCode,
  };

  return (
    <LiveProvider initialSnapshot={snapshot}>
      <AppShell user={user} unread={unread}>
        {children}
      </AppShell>
    </LiveProvider>
  );
}
