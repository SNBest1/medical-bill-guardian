import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";

/** Surfaces an abandoned operation's facts so an operator inspects reality (stored case state,
 * last communication, resolution, recovery) before deciding whether to force the guard open. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  const store = getStore();
  const current = store.get(id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const operation = store.operationInfo(id);
  return NextResponse.json({
    caseId: id,
    operationActive: Boolean(operation),
    operationStartedAt: operation?.startedAt ?? null,
    status: current.status,
    lastCommunication: current.communications.at(-1) ?? null,
    resolution: current.resolution,
    recovery: current.recovery ?? null
  });
}

/** Force-releases a stuck operation guard only after the caller confirms it inspected the facts
 * above; it never retries the provider call itself. The release and audit note are applied
 * under a freshly reacquired guard so a racing mutation cannot be overwritten. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  const store = getStore();
  if (!store.get(id)) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { acknowledgeInspected?: boolean };
  if (body.acknowledgeInspected !== true) return NextResponse.json({ error: "Inspect the case and provider facts, then confirm acknowledgeInspected" }, { status: 403 });
  const operation = store.operationInfo(id);
  if (!operation) return NextResponse.json({ caseId: id, released: false, reason: "No operation was active" });
  store.forceReleaseOperation(id);
  const token = store.acquireOperation(id);
  if (!token) return NextResponse.json({ caseId: id, released: true, note: "Operation was re-acquired by another request before the audit note could be added" });
  try {
    const latest = store.get(id)!;
    const timestamp = new Date().toISOString();
    latest.auditLog.push({ id: crypto.randomUUID(), timestamp, action: "OPERATOR_RECOVERY", tool: "forceReleaseOperation", inputSummary: `Operation started ${operation.startedAt}`, outputSummary: "Guard released after manual inspection", status: "SUCCESS" });
    latest.updatedAt = timestamp;
    store.save(latest);
  } finally { store.releaseOperation(id, token); }
  return NextResponse.json({ caseId: id, released: true });
}
