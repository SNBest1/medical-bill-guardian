import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { bankProvider, communicationProvider, demoMode, medicalProvider } from "@/lib/providers";
import { resolveCommand } from "@/services/agent/command";
import { openScenarioCase, ScenarioOpenError } from "@/services/agent/open-scenario";
import { investigateCase, ContactAmbiguousError } from "@/services/agent/orchestrator";
import { mutateCase, CaseBusyError } from "@/services/agent/case-operation";
import { getScenario } from "@/services/scenarios";

export const runtime = "nodejs";
/** Takes a typed or spoken instruction such as "investigate Maya's hospital bill", finds that
 * patient's case, and starts the agent. The instruction is the patient's request to collect
 * records and an itemized bill; contacting hospital billing still needs its own approval later. */
export async function POST(request: Request) {
  if (!demoMode()) return NextResponse.json({ error: "The command box is available only in demo mode" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { text?: string; scenarioId?: string };
  const picked = body.scenarioId ? getScenario(body.scenarioId) : undefined;
  const resolved = picked ? { kind: "match" as const, scenario: picked } : resolveCommand(String(body.text ?? ""));
  if (resolved.kind === "unknown") return NextResponse.json({ error: "I couldn't tell which bill you mean. Try a patient's name, like “investigate Maya's hospital bill”." }, { status: 422 });
  if (resolved.kind === "ambiguous") return NextResponse.json({ error: `That could be more than one bill: ${resolved.options.map((option) => `${option.patient.firstName} ${option.patient.lastName}`).join(" or ")}. Which one?` }, { status: 422 });
  const { scenario } = resolved;
  const store = getStore();
  try {
    const opened = await openScenarioCase(store, scenario, bankProvider(scenario.id));
    const investigated = opened.case.status === "DETECTED"
      ? await mutateCase(store, opened.case.id, (latest) => investigateCase(latest, medicalProvider(), communicationProvider()), (error) => error instanceof ContactAmbiguousError)
      : opened.case;
    return NextResponse.json({ case: investigated, scenario: scenario.id, patient: `${scenario.patient.firstName} ${scenario.patient.lastName}`, resumed: opened.resumed });
  } catch (error) {
    if (error instanceof ScenarioOpenError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: String(error), requiresRecovery: error instanceof ContactAmbiguousError }, { status: error instanceof CaseBusyError ? 409 : 502 });
  }
}
