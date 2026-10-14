import { eq } from "drizzle-orm";
import { db } from "@/db";
import { thresholdConfigs } from "@/db/schema";
import { fail, ok, parseJson, requireUser } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { logEvent } from "@/lib/http";
import { thresholdsUpdateSchema } from "@/lib/validation";
import { validateThresholds } from "@/lib/safety/types";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const settings = await getSettings();
  return Response.json({ thresholds: settings }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const auth = await requireUser(["admin", "supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, thresholdsUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const current = await getSettings();
  const validation = validateThresholds({ ...current, ...parsed.data });
  if (!validation.ok) {
    return fail("Threshold validation failed", 422, validation.issues);
  }

  const next = validation.value;
  const updated = await db
    .update(thresholdConfigs)
    .set({
      gasWarning: next.gasWarning,
      gasCritical: next.gasCritical,
      gasUnit: next.gasUnit,
      temperatureWarning: next.temperatureWarning,
      temperatureCritical: next.temperatureCritical,
      humidityWarning: next.humidityWarning,
      batteryLow: next.batteryLow,
      offlineTimeoutSeconds: next.offlineTimeoutSeconds,
      fallImpactG: next.fallImpactG,
      fallFreeFallG: next.fallFreeFallG,
      fallWindowMs: next.fallWindowMs,
      anomalyEnabled: next.anomalyEnabled,
      anomalySensitivity: next.anomalySensitivity,
      anomalyWindow: next.anomalyWindow,
      alertCooldownSeconds: next.alertCooldownSeconds,
      soundEnabled: parsed.data.soundEnabled ?? current.soundEnabled,
      vibrationEnabled: parsed.data.vibrationEnabled ?? current.vibrationEnabled,
      emergencyContacts: parsed.data.emergencyContacts ?? current.emergencyContacts,
      notificationPrefs: parsed.data.notificationPrefs ?? current.notificationPrefs,
      updatedBy: auth.session.uid,
      updatedAt: new Date(),
    })
    .where(eq(thresholdConfigs.scope, "global"))
    .returning();

  await logEvent("info", "settings", "Safety thresholds updated", {
    by: auth.session.username,
    changes: parsed.data,
  });

  if (!updated[0]) return fail("Threshold configuration row missing", 500);
  return ok({
    thresholds: await getSettings(),
    esp32Sync: {
      status: process.env.MQTT_URL ? "supported" : "pending-setup",
      detail: process.env.MQTT_URL
        ? `Publishes to ${process.env.MQTT_CONFIG_TOPIC ?? "minesafe/config/thresholds"} on the next change.`
        : "Set MQTT_URL to push thresholds to helmets over MQTT (docs/ESP32_INTEGRATION.md).",
    },
  });
}
