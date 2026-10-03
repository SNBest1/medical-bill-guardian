import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { demoMode } from "@/lib/providers";
import { receiveItemizedStatement } from "@/services/agent/orchestrator";
import { mutateCase, CaseBusyError } from "@/services/agent/case-operation";

export const runtime = "nodejs";
/** Local synthetic inbox only. External delivery needs authenticated sender verification. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!demoMode()) return NextResponse.json({ error: "Synthetic inbox requires demo mode" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 65536) return NextResponse.json({ error: "Statement too large" }, { status: 413 });
  const body = await request.text();
  if (body.length > 65536) return NextResponse.json({ error: "Statement too large" }, { status: 413 });
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try { const next = await mutateCase(getStore(), current.id, (latest) => receiveItemizedStatement(latest, body)); return NextResponse.json(next); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: error instanceof CaseBusyError ? 409 : 400 }); }
}
