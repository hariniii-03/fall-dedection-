import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  const started = Date.now();
  let database = "down";
  try {
    await db.execute(sql`select 1`);
    database = "up";
  } catch {
    database = "down";
  }

  return Response.json(
    {
      status: database === "up" ? "ok" : "degraded",
      service: "minesafe-ai-backend",
      database,
      integrations: {
        expoPush: process.env.EXPO_ACCESS_TOKEN ? "configured" : "not-configured (local fallback)",
        mqtt: process.env.MQTT_URL ? "configured" : "not-configured (HTTP ingestion)",
        deviceApiKey: process.env.DEVICE_API_KEY ? "configured" : "open-in-dev",
      },
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    },
    { status: database === "up" ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
