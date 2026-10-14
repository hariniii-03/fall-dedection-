import { z } from "zod";
import { fail, ok, parseJson, requireUser } from "@/lib/http";
import { helmetCodes, injectScenario, isSimulatorEnabled, setSimulatorEnabled, simulatorStatus, type ScenarioKind } from "@/lib/simulator";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return Response.json(
    { ...(await simulatorStatus()), enabled: await isSimulatorEnabled(), codes: await helmetCodes() },
    { headers: { "cache-control": "no-store" } },
  );
}

const bodySchema = z.object({
  action: z.enum(["enable", "disable", "inject"]),
  scenario: z.enum(["gas", "fall", "temperature", "battery", "sos"]).optional(),
  helmetCode: z.string().trim().max(64).optional(),
});

/**
 * Development helper: toggle the simulated feed or inject a labelled
 * SIMULATED scenario (gas / fall / temperature / battery / sos).
 */
export async function POST(request: Request) {
  const auth = await requireUser(["admin", "supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { action, scenario, helmetCode } = parsed.data;

  if (action === "enable" || action === "disable") {
    await setSimulatorEnabled(action === "enable");
    return ok({ enabled: await isSimulatorEnabled() });
  }

  if (!scenario) return fail("scenario is required for action=inject", 422);
  const result = await injectScenario(scenario as ScenarioKind, helmetCode);
  return ok({ ...result, label: "SIMULATED", note: "This reading is simulated test data, not a real measurement." });
}
