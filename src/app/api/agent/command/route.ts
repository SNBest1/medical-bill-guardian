import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { bankProvider, communicationProvider, demoMode, medicalProvider } from "@/lib/providers";
import { ScenarioOpenError } from "@/services/agent/open-scenario";
import { ContactAmbiguousError } from "@/services/agent/orchestrator";
import { CaseBusyError } from "@/services/agent/case-operation";
import { runAgentCommand } from "@/services/agent/run-command";

export const runtime = "nodejs";
/** Takes a typed or spoken instruction such as "investigate Maya's hospital bill", finds that
 * patient's case, and starts the agent. The instruction is the patient's request to collect
 * records and an itemized bill; contacting hospital billing still needs its own approval later. */
export async function POST(request: Request) {
  if (!demoMode()) return NextResponse.json({ error: "The command box is available only in demo mode" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { text?: string; scenarioId?: string };
  try {
    const outcome = await runAgentCommand(getStore(), body, { bank: bankProvider, medical: medicalProvider(), communications: communicationProvider() });
    if (outcome.kind === "unknown") return NextResponse.json({ error: "I couldn't tell which bill you mean. Try a patient's name, like “investigate Maya's hospital bill”." }, { status: 422 });
    if (outcome.kind === "ambiguous") return NextResponse.json({ error: `That could be more than one bill: ${outcome.options.map((option) => `${option.patient.firstName} ${option.patient.lastName}`).join(" or ")}. Which one?` }, { status: 422 });
    return NextResponse.json({ case: outcome.case, scenario: outcome.scenario.id, patient: outcome.patient, resumed: outcome.resumed });
  } catch (error) {
    if (error instanceof ScenarioOpenError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: String(error), requiresRecovery: error instanceof ContactAmbiguousError }, { status: error instanceof CaseBusyError ? 409 : 502 });
  }
}
