import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider } from "@/lib/providers";
import { notifyCase } from "@/services/agent/orchestrator";
import { mutateCase, CaseBusyError } from "@/services/agent/case-operation";

export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try { const next = await mutateCase(getStore(), current.id, (latest) => latest.status === "USER_NOTIFIED" ? latest : notifyCase(latest, communicationProvider())); return NextResponse.json(next); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: error instanceof CaseBusyError ? 409 : 400 }); }
}
