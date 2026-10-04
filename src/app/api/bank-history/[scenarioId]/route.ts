import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { demoMode } from "@/lib/providers";
import { getScenario } from "@/services/scenarios";
import { demoBankHistory } from "@/services/banking/demo-history";
import { nessieBankHistory } from "@/services/banking/nessie-history";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ scenarioId: string }> }) {
  if (!demoMode()) return new Response(null, { status: 403 });
  const { scenarioId } = await context.params;
  if (!getScenario(scenarioId)) return new Response(null, { status: 404 });
  const current = getStore().list().find((c) => c.scenarioId === scenarioId);
  try {
    const history = process.env.NESSIE_SANDBOX_DISCOVERY === "true" ? await nessieBankHistory(scenarioId, current) : { ...demoBankHistory(scenarioId, current)!, source: "local" as const, notice: "Local fictional history; not connected to Nessie." };
    return NextResponse.json(history, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Nessie history is unavailable. Retrying; no local balance is substituted." }, { status: 503 }); }
}
