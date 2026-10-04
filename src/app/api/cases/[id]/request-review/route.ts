import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { sendProgressUpdate } from "@/services/agent/progress-updates";
import { communicationProvider } from "@/lib/providers";
import { reviewCase, notifyCase, scenarioIdOf } from "@/services/agent/orchestrator";
import { fishConfigFromEnv, fishProblems, maskPhone } from "@/services/communications/fish-call";
import { buildReviewVariables, reviewBrief } from "@/services/communications/fish-review";

export const runtime = "nodejs";
/** What the authorization panel shows before the user decides: whether the review will be a real call, and what it will say. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const config = fishConfigFromEnv();
  if (!config?.reviewAgentId || !current.bill) return NextResponse.json({ live: false });
  const problems = fishProblems(config);
  let brief: string[] = [];
  try { brief = reviewBrief(buildReviewVariables(current.provider.name, current.bill, current.findings, scenarioIdOf(current))); } catch { problems.push("this case has no questioned charge to brief the call"); }
  return NextResponse.json({ live: true, ready: problems.length === 0, problems, brief, destination: maskPhone(config.toNumber) });
}

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
      await sendProgressUpdate(store, reviewed);
    }
    const next = reviewed.status === "RESOLVED" ? await notifyCase(reviewed, provider) : reviewed;
    store.save(next);
    store.releaseOperation(id, token);
    await sendProgressUpdate(store, next);
    return NextResponse.json(next);
  } catch (error) {
    // An uncertain provider result must not cause a second contact on automatic retry.
    if (!contacting) store.releaseOperation(id, token);
    return NextResponse.json({ error: String(error), requiresRecovery: contacting }, { status: contacting ? 409 : 400 });
  }
}
