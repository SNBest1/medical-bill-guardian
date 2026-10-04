import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { bankProvider, demoMode } from "@/lib/providers";
import { discoverHospitalPayments } from "@/services/banking/discovery";
import { getScenario } from "@/services/scenarios";

export const runtime = "nodejs";
/** Records the judge's accident choice and opens (or resumes) that patient's case. The agent then
 * works only from that case; it still needs the patient's authorization before collecting records. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!demoMode()) return NextResponse.json({ error: "Scenario selection is available only in demo mode" }, { status: 403 });
  const scenario = getScenario((await context.params).id);
  if (!scenario) return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
  try {
    const store = getStore();
    const { cases } = await discoverHospitalPayments(store, bankProvider(scenario.id));
    const opened = cases[0];
    if (!opened) return NextResponse.json({ error: "The bank returned no matching hospital payment for this patient" }, { status: 502 });
    if (opened.scenarioId) return NextResponse.json({ case: opened, resumed: true });
    const token = store.acquireOperation(opened.id);
    if (!token) return NextResponse.json({ error: "A case operation is active. Try again in a moment." }, { status: 409 });
    try {
      const now = new Date().toISOString();
      const selected = structuredClone(opened);
      selected.scenarioId = scenario.id;
      selected.auditLog.push({ id: crypto.randomUUID(), timestamp: now, action: "SELECT_SCENARIO", tool: "selectScenario", inputSummary: scenario.id, outputSummary: `${scenario.patient.firstName} ${scenario.patient.lastName} · ${scenario.hospital.name}`, status: "SUCCESS" });
      selected.timeline.push({ id: crypto.randomUUID(), timestamp: now, title: "Accident selected", detail: `${scenario.label}. ${scenario.accident}`, source: "Patient", status: "complete" });
      selected.updatedAt = now;
      store.save(selected);
      return NextResponse.json({ case: selected, resumed: false }, { status: 201 });
    } finally { store.releaseOperation(opened.id, token); }
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 502 }); }
}
