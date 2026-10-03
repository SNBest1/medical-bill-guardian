import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { authorizedWorker } from "@/services/agent/worker-auth";
import type { PhotonTextAction } from "@/services/communications/photon-text";

export const runtime = "nodejs";

/**
 * Operator-only: resolves an UNCERTAIN outbound text after checking Spectrum/iMessage directly.
 * This never resends by itself — "FAILED" only reopens the record so a later, explicit
 * authorized send can retry; "DELIVERED" records the operator's own confirmation.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!authorizedWorker(request)) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: PhotonTextAction; resolution?: "DELIVERED" | "FAILED"; messageId?: string };
  if (!["REQUEST_STATEMENT", "NOTIFY_PATIENT"].includes(body.action ?? "") || !["DELIVERED", "FAILED"].includes(body.resolution ?? "")) {
    return NextResponse.json({ error: "resolution must be DELIVERED or FAILED for a known action" }, { status: 400 });
  }
  const id = (await context.params).id;
  const store = getStore();
  if (!store.get(id)) return new Response(null, { status: 404 });
  const key = `${id}:${body.action}`;
  const before = store.textStatus(key);
  if (!before || before.status !== "UNCERTAIN") return NextResponse.json({ error: "No uncertain record for this action" }, { status: 409 });
  const resolved = store.recoverText(key, body.resolution!, body.messageId);
  if (!resolved) return NextResponse.json({ error: "Record changed before recovery could apply" }, { status: 409 });
  return NextResponse.json(store.textStatus(key));
}
