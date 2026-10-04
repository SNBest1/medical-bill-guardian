import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider } from "@/lib/providers";
import { notifyCase, settleReviewCall } from "@/services/agent/orchestrator";
import { mutateCase, CaseBusyError } from "@/services/agent/case-operation";

export const runtime = "nodejs";

/**
 * Polled by the case page while the review call is live. Copies the call's transcript onto the
 * case; when the call has ended, records the outcome and writes the patient summary. Returns 202
 * while the call is still going. It never places a call.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  const store = getStore();
  const current = store.get(id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (current.status !== "WAITING_FOR_PROVIDER") return NextResponse.json(current);
  try {
    const next = await mutateCase(store, id, async (latest) => {
      const provider = communicationProvider();
      const settled = await settleReviewCall(latest, provider);
      return settled.status === "RESOLVED" ? notifyCase(settled, provider) : settled;
    });
    return NextResponse.json(next, { status: next.status === "WAITING_FOR_PROVIDER" ? 202 : 200 });
  } catch (error) {
    // Another poll is already reading the same call; the page just asks again.
    if (error instanceof CaseBusyError) return NextResponse.json(current, { status: 202 });
    return NextResponse.json({ error: "Could not read the review call yet. The page will retry." }, { status: 502 });
  }
}
