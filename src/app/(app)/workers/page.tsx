import { canManageWorkers, getSession } from "@/lib/auth";
import { getHelmetViews, listWorkersWithStatus } from "@/lib/queries";
import { WorkersClient } from "@/components/WorkersClient";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const [workers, helmets, session] = await Promise.all([
    listWorkersWithStatus(),
    getHelmetViews(),
    getSession(),
  ]);
  return (
    <WorkersClient
      workers={workers}
      helmetCodes={helmets.map((h) => h.code)}
      canManage={session ? canManageWorkers(session.role) : false}
    />
  );
}
