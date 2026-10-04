import { NextResponse } from "next/server";
import { getStore } from "../../../../../lib/db";
import { communicationProvider } from "../../../../../lib/providers";
import { requestItemizedBill } from "../../../../../services/agent/orchestrator";
import { FishCallError } from "../../../../../services/communications/fish-demo";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  let authorized = false;
  try {
    const body = await request.json() as { authorized?: boolean };
    authorized = body.authorized === true;
  } catch {
    return NextResponse.json({ error: "A valid JSON body with explicit authorization is required" }, { status: 400 });
  }

  try {
    const next = await requestItemizedBill(current, communicationProvider(), authorized);
    getStore().save(next);
    return NextResponse.json(next);
  } catch (error) {
    if (error instanceof FishCallError) {
      return NextResponse.json({
        error: "Fish Audio call failed",
        upstreamStatus: error.status,
        responseBody: error.responseBody,
      }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
