import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider } from "@/lib/providers";
import { notifyCase } from "@/services/agent/orchestrator";

export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try { const next = await notifyCase(current, communicationProvider()); getStore().save(next); return NextResponse.json(next); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
