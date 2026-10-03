import { NextResponse } from "next/server";
import { demoMode } from "@/lib/providers";
import { getStore } from "@/lib/db";
import { createCase } from "@/services/agent/orchestrator";
import { demoTransaction } from "@/services/demo";

export const runtime = "nodejs";
/** Restarts only the seeded synthetic case for a repeatable hackathon demo. */
export async function POST() {
  if (!demoMode()) return NextResponse.json({ error: "Demo reset is unavailable outside demo mode" }, { status: 403 });
  const fresh = createCase(demoTransaction);
  const store = getStore();
  const token = store.acquireOperation(fresh.id);
  if (!token) return NextResponse.json({ error: "A case operation is active or awaiting recovery. Review its outcome before resetting." }, { status: 409 });
  try {
    if (store.get(fresh.id)) store.save(fresh);
    else store.create(fresh);
    return NextResponse.json(fresh);
  } finally { store.releaseOperation(fresh.id, token); }
}
