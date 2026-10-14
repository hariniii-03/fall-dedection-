import { eq } from "drizzle-orm";
import { db } from "@/db";
import { thresholdConfigs } from "@/db/schema";
import { DEFAULT_THRESHOLDS, type SafetyThresholds } from "@/lib/safety/types";

export type SafetySettings = SafetyThresholds & {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  emergencyContacts: { mineControlRoom: string; safetyOfficer: string; rescueTeam: string };
  notificationPrefs: { push: boolean; inApp: boolean; criticalOnly: boolean };
};

const FALLBACK: SafetySettings = {
  ...DEFAULT_THRESHOLDS,
  soundEnabled: true,
  vibrationEnabled: true,
  emergencyContacts: {
    mineControlRoom: "+91-000-000-0000",
    safetyOfficer: "Not configured",
    rescueTeam: "Not configured",
  },
  notificationPrefs: { push: true, inApp: true, criticalOnly: false },
};

/** Load the global threshold row, creating it with safe defaults on first use. */
export async function getSettings(): Promise<SafetySettings> {
  const rows = await db
    .select()
    .from(thresholdConfigs)
    .where(eq(thresholdConfigs.scope, "global"));
  let row = rows[0];
  if (!row) {
    const inserted = await db
      .insert(thresholdConfigs)
      .values({ scope: "global", ...DEFAULT_THRESHOLDS })
      .onConflictDoNothing()
      .returning();
    row = inserted[0] ?? (await db.select().from(thresholdConfigs).where(eq(thresholdConfigs.scope, "global")))[0];
  }
  if (!row) return FALLBACK;

  return {
    gasWarning: row.gasWarning,
    gasCritical: row.gasCritical,
    gasUnit: row.gasUnit,
    temperatureWarning: row.temperatureWarning,
    temperatureCritical: row.temperatureCritical,
    humidityWarning: row.humidityWarning,
    batteryLow: row.batteryLow,
    offlineTimeoutSeconds: row.offlineTimeoutSeconds,
    fallImpactG: row.fallImpactG,
    fallFreeFallG: row.fallFreeFallG,
    fallWindowMs: row.fallWindowMs,
    anomalyEnabled: row.anomalyEnabled,
    anomalySensitivity: row.anomalySensitivity,
    anomalyWindow: row.anomalyWindow,
    alertCooldownSeconds: row.alertCooldownSeconds,
    soundEnabled: row.soundEnabled,
    vibrationEnabled: row.vibrationEnabled,
    emergencyContacts: row.emergencyContacts ?? FALLBACK.emergencyContacts,
    notificationPrefs: row.notificationPrefs ?? FALLBACK.notificationPrefs,
  };
}

export { DEFAULT_THRESHOLDS };
