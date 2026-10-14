import { getDashboardSnapshot, getReadingSeries } from "@/lib/queries";
import { MonitorClient } from "@/components/MonitorClient";
import type { DashboardSnapshot } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const snapshot: DashboardSnapshot = await getDashboardSnapshot();
  const entries = await Promise.all(
    snapshot.helmets.map(async (h) => {
      const s = await getReadingSeries(h.code, 60);
      return [h.code, s?.series ?? []] as const;
    }),
  );

  return <MonitorClient initialSnapshot={snapshot} initialSeries={Object.fromEntries(entries)} />;
}
