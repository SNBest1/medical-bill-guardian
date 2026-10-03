import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider } from "@/lib/providers";
import { analyzeCase } from "@/services/agent/orchestrator";

export const runtime = "nodejs";
/** Checks for a delivered statement and analyzes it when available. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try {
    const next = await analyzeCase(current, communicationProvider());
    if (next !== current) getStore().save(next);
    return NextResponse.json(next, { status: next.status === "WAITING_FOR_BILL" ? 202 : 200 });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 502 }); }
}
