import { NextResponse } from "next/server";
import { evaluatePriceResearch, validateResearchRequest } from "@/services/research/price-research";
import { fetchLiveCatalog } from "@/services/research/live-source";

export const runtime = "nodejs";
export const maxDuration = 60;
let running = false;

/** Demo-only direct research tool; does not intercept existing Relay subscriptions or case jobs. */
export async function POST(request: Request) {
  if (process.env.DEMO_MODE === "false") return NextResponse.json({ error: "Real patient research remains disabled" }, { status: 403 });
  if (running) return NextResponse.json({ error: "Research worker busy; retry shortly" }, { status: 429 });
  const raw = await request.text();
  if (raw.length > 16384) return NextResponse.json({ error: "Research request too large" }, { status: 413 });
  let context;
  try { context = validateResearchRequest(JSON.parse(raw)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid research request" }, { status: 400 }); }
  if (running) return NextResponse.json({ error: "Research worker busy; retry shortly" }, { status: 429 });
  running = true;
  try {
    const catalog = await fetchLiveCatalog(context.code);
    return NextResponse.json(evaluatePriceResearch(context, catalog, "LIVE_SOURCE_FETCH"));
  } catch {
    // Never silently re-label old snapshot prices as current live research.
    return NextResponse.json({ error: "Live publisher research unavailable; retry or use an explicitly labeled cached lookup" }, { status: 502 });
  } finally { running = false; }
}
