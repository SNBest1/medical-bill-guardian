import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider } from "@/lib/providers";
import { analyzeCase } from "@/services/agent/orchestrator";
import { mutateCase, CaseBusyError } from "@/services/agent/case-operation";

export const runtime = "nodejs";
/** Checks for a delivered statement and analyzes it when available. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try {
    const next = await mutateCase(getStore(), current.id, (latest) => analyzeCase(latest, communicationProvider()));
    return NextResponse.json(next, { status: next.status === "WAITING_FOR_BILL" ? 202 : 200 });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: error instanceof CaseBusyError ? 409 : 502 }); }
}
