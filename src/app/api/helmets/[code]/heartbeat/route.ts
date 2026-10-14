/**
 * Helmet heartbeat / connection status.
 *
 *   POST /api/helmets/HELMET-001/heartbeat
 *   x-device-key: <DEVICE_API_KEY>
 *   { "battery_percent": 81, "firmware_version": "esp32-s3-1.0.0", "rssi": -58 }
 *
 * The ESP32-S3 should send this every 15-30s. If heartbeats stop, the backend
 * marks the helmet offline and raises an offline alert.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { helmets } from "@/db/schema";
import { fail, ok, parseJson, verifyDeviceKey } from "@/lib/http";
import { connectionStateFor } from "@/lib/safety/engine";
import { getSettings } from "@/lib/settings";
import { heartbeatSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Ctx) {
  if (!verifyDeviceKey(request)) return fail("Invalid device key", 401);
  const { code } = await context.params;
  const parsed = await parseJson(request, heartbeatSchema);
  if (!parsed.ok) return parsed.response;

  const rows = await db.select().from(helmets).where(eq(helmets.code, code.toUpperCase()));
  const helmet = rows[0];
  if (!helmet) return fail(`Helmet ${code} is not registered`, 404);

  const now = new Date();
  await db
    .update(helmets)
    .set({
      lastHeartbeatAt: now,
      batteryPercent: parsed.data.battery_percent ?? helmet.batteryPercent,
      firmwareVersion: parsed.data.firmware_version ?? helmet.firmwareVersion,
      connectionState: "online",
    })
    .where(eq(helmets.id, helmet.id));

  const settings = await getSettings();
  return ok({
    helmetId: helmet.code,
    receivedAt: now.toISOString(),
    connectionState: connectionStateFor(now, settings.offlineTimeoutSeconds),
    config: {
      gasWarning: settings.gasWarning,
      gasCritical: settings.gasCritical,
      gasUnit: settings.gasUnit,
      temperatureWarning: settings.temperatureWarning,
      temperatureCritical: settings.temperatureCritical,
      batteryLow: settings.batteryLow,
      offlineTimeoutSeconds: settings.offlineTimeoutSeconds,
      fallImpactG: settings.fallImpactG,
      buzzerOnCritical: true,
    },
    note: "Use the returned `config` block as the remotely-synced threshold set on the ESP32-S3.",
  });
}
