import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getHelmetViews, listEventLogs } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { isSimulatorEnabled } from "@/lib/simulator";
import { SettingsClient } from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [settings, simulator, helmets, logs] = await Promise.all([
    getSettings(),
    isSimulatorEnabled(),
    getHelmetViews(),
    listEventLogs(20),
  ]);

  return (
    <SettingsClient
      initial={settings}
      role={session.role}
      simulatorEnabled={simulator}
      helmetCodes={helmets.map((h) => h.code)}
      eventLog={logs.map((l) => ({ id: l.id, level: l.level, source: l.source, message: l.message, createdAt: l.createdAt }))}
      integrations={{
        expoPush: process.env.EXPO_ACCESS_TOKEN ? "configured" : "not configured — local fallback",
        mqtt: process.env.MQTT_URL ? "configured" : "not configured — HTTP ingestion",
        deviceApiKey: process.env.DEVICE_API_KEY ? "configured" : "open in development",
      }}
    />
  );
}
