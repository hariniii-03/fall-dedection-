/**
 * ESP32-S3 HTTP ingestion endpoint.
 *
 *   POST /api/ingest/sensor
 *   x-device-key: <DEVICE_API_KEY>          (required when configured)
 *   content-type: application/json
 *
 * See docs/ESP32_INTEGRATION.md for the firmware payload contract and MQTT
 * topic conventions (the MQTT bridge posts to this same endpoint).
 */
import { fail, logEvent, ok, rateLimit, clientKey, verifyDeviceKey } from "@/lib/http";
import { ingestReading, EngineError } from "@/lib/safety/engine";
import { parseJson } from "@/lib/http";
import { sensorPayloadSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!verifyDeviceKey(request)) {
    await logEvent("warn", "ingest", "Rejected sensor payload: invalid device key");
    return fail("Invalid device key", 401);
  }
  if (!rateLimit(clientKey(request, "ingest"), 600, 60_000)) {
    return fail("Ingest rate limit exceeded", 429);
  }

  const parsed = await parseJson(request, sensorPayloadSchema);
  if (!parsed.ok) {
    await logEvent("warn", "ingest", "Rejected malformed sensor payload");
    return parsed.response;
  }

  try {
    const result = await ingestReading(parsed.data);
    return ok(
      {
        accepted: true,
        readingId: result.readingId,
        helmetCode: result.helmetCode,
        workerCode: result.workerCode,
        connectionState: result.connectionState,
        anomaly: result.anomaly
          ? {
              label: result.anomaly.label,
              score: result.anomaly.score,
              maxSigma: result.anomaly.maxSigma,
              detector: result.anomaly.detector,
              reason: result.anomaly.reason,
            }
          : null,
        alerts: result.alertsRaised,
        // The buzzer must reflect the LIVE hazard, not whether a new alert row
        // was created. `suppressed: true` means an identical alert is already
        // open inside the cooldown window — the gas is still there, so the
        // helmet must keep buzzing. Only a dedupe key whose alert was resolved
        // produces a fresh (unsuppressed) alert row.
        buzzerCommand: result.alertsRaised.some((a) => a.severity === "critical")
          ? "ON"
          : "OFF",
      },
      201,
    );
  } catch (err) {
    if (err instanceof EngineError) return fail(err.message, err.status);
    await logEvent("error", "ingest", "Sensor ingestion failed", { error: String(err) });
    return fail("Failed to process sensor payload", 500);
  }
}

export async function GET() {
  return ok({
    endpoint: "/api/ingest/sensor",
    method: "POST",
    auth: "x-device-key header (required when DEVICE_API_KEY is set)",
    examplePayload: {
      helmet_id: "HELMET-001",
      worker_id: "WORKER-001",
      timestamp: new Date().toISOString(),
      gas_raw: 1250,
      temperature_c: 32.5,
      humidity_percent: 68,
      accel_x: 0.15,
      accel_y: 0.22,
      accel_z: 0.985,
      battery_percent: 82,
      source: "device",
    },
    note: "gas_raw is the MQ-135 raw ADC value, not a calibrated AQI/ppm value.",
  });
}
