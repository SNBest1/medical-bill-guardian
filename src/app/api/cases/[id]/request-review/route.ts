import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider } from "@/lib/providers";
import { reviewCase, notifyCase } from "@/services/agent/orchestrator";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const store = getStore();
  const id = (await context.params).id;
  if (!store.get(id)) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { authorized?: boolean };
  if (body.authorized !== true) return NextResponse.json({ error: "User authorization is required" }, { status: 403 });
  const token = store.acquireOperation(id);
  if (!token) return NextResponse.json({ error: "A case operation is active or awaiting recovery. Review its outcome before retrying." }, { status: 409 });
  let contacting = false;
  try {
    const current = store.get(id)!;
    if (current.status === "USER_NOTIFIED" || current.status === "WAITING_FOR_PROVIDER") {
      store.releaseOperation(id, token);
      return NextResponse.json(current);
    }
    const provider = communicationProvider();
    let reviewed = current;
    if (current.status !== "RESOLVED") {
      if (current.status !== "REVIEW_REQUIRED" || !current.bill) throw new Error("Case is not ready for billing review");
      contacting = true;
      reviewed = await reviewCase(current, provider, true);
      store.save(reviewed);
      contacting = false;
    }
    const next = reviewed.status === "RESOLVED" ? await notifyCase(reviewed, provider) : reviewed;
    store.save(next);
    store.releaseOperation(id, token);
    return NextResponse.json(next);
  } catch (error) {
    // An uncertain provider result must not cause a second contact on automatic retry.
    if (!contacting) store.releaseOperation(id, token);
    return NextResponse.json({ error: String(error), requiresRecovery: contacting }, { status: contacting ? 409 : 400 });
  }
}
