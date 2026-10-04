import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { bankProvider, demoMode } from "@/lib/providers";
import { openScenarioCase, ScenarioOpenError } from "@/services/agent/open-scenario";
import { getScenario } from "@/services/scenarios";

export const runtime = "nodejs";
/** Records the judge's patient choice and opens (or resumes) that patient's case. Investigation
 * is a separate step that needs the patient's authorization. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!demoMode()) return NextResponse.json({ error: "Scenario selection is available only in demo mode" }, { status: 403 });
  const scenario = getScenario((await context.params).id);
  if (!scenario) return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
  try {
    const result = await openScenarioCase(getStore(), scenario, bankProvider(scenario.id));
    return NextResponse.json(result, { status: result.resumed ? 200 : 201 });
  } catch (error) { return NextResponse.json({ error: String(error instanceof ScenarioOpenError ? error.message : error) }, { status: error instanceof ScenarioOpenError ? error.status : 502 }); }
}
