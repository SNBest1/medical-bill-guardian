import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { communicationProvider, medicalProvider, demoMode } from "@/lib/providers";
import { investigateCase, ContactAmbiguousError } from "@/services/agent/orchestrator";
import { isDemoTransaction } from "@/services/scenarios";
import { mutateCase, CaseBusyError } from "@/services/agent/case-operation";

export const runtime = "nodejs";
/** Starts investigation either on explicit interactive authorization, or on a persisted,
 * scoped patient authorization granted ahead of time for unattended use (never inferred
 * from the payment itself). The grant is single-use: it is consumed only after this run
 * actually succeeds, so a busy-guard or transient failure leaves it intact for retry. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  const store = getStore();
  const current = store.get(id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { authorized?: boolean };
  const interactive = body.authorized === true;
  const grant = interactive ? null : store.getAuthorization(id);
  const unattended = !interactive && grant?.scope === "INVESTIGATE";
  if (!interactive && !unattended) return NextResponse.json({ error: "Authorize bill collection before starting the investigation" }, { status: 403 });
  if (demoMode() && !isDemoTransaction(current.transaction)) return NextResponse.json({ error: "Discovered sandbox payments require matched consented records; the seeded records cannot be attached to another payment" }, { status: 409 });
  try {
    const next = await mutateCase(store, id, (latest) => investigateCase(latest, medicalProvider(), communicationProvider()), (error) => error instanceof ContactAmbiguousError);
    if (unattended) store.revokeAuthorization(id);
    return NextResponse.json(next);
  } catch (error) {
    const ambiguous = error instanceof ContactAmbiguousError;
    return NextResponse.json({ error: String(error), requiresRecovery: ambiguous }, { status: error instanceof CaseBusyError ? 409 : 502 });
  }
}
