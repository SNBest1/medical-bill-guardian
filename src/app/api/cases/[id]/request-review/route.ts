import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider } from "@/lib/providers";
import { reviewCase, notifyCase } from "@/services/agent/orchestrator";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { authorized?: boolean };
  try {
    const provider = communicationProvider();
    const reviewed = await reviewCase(current, provider, body.authorized === true);
    getStore().save(reviewed);
    const next = reviewed.status === "RESOLVED" ? await notifyCase(reviewed, provider) : reviewed;
    getStore().save(next);
    return NextResponse.json(next);
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
