import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider, medicalProvider } from "@/lib/providers";
import { investigateCase } from "@/services/agent/orchestrator";

export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try { const next = await investigateCase(current, medicalProvider(), communicationProvider()); getStore().save(next); return NextResponse.json(next); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 502 }); }
}
