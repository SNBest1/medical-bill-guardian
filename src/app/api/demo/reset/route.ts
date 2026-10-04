import { NextResponse } from "next/server";
import { demoMode } from "@/lib/providers";
import { getStore } from "@/lib/db";
import { createCase } from "@/services/agent/orchestrator";
import { demoTransaction } from "@/services/demo";

export const runtime = "nodejs";
/** Restarts a synthetic case for a repeatable demo: the given case (keeping its ID and picked
 * scenario), or the original seeded University Hospital case when none is given. */
export async function POST(request: Request) {
  if (!demoMode()) return NextResponse.json({ error: "Demo reset is unavailable outside demo mode" }, { status: 403 });
  const { caseId } = await request.json().catch(() => ({})) as { caseId?: string };
  const store = getStore();
  const existing = caseId ? store.get(caseId) : null;
  if (caseId && !existing) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const fresh = createCase(existing?.transaction ?? demoTransaction);
  if (existing) { fresh.id = existing.id; fresh.scenarioId = existing.scenarioId; }
  const token = store.acquireOperation(fresh.id);
  if (!token) return NextResponse.json({ error: "A case operation is active or awaiting recovery. Review its outcome before resetting." }, { status: 409 });
  try {
    if (store.get(fresh.id)) store.save(fresh);
    else store.create(fresh);
    return NextResponse.json(fresh);
  } finally { store.releaseOperation(fresh.id, token); }
}
