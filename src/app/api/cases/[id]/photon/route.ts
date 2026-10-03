import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { authorizedWorker } from "@/services/agent/worker-auth";
import { photonText, sendPhotonText, PhotonSendUncertainError, type PhotonTextAction } from "@/services/communications/photon-text";

export const runtime = "nodejs";
/** Operator-only rehearsal control. No project token or worker token is sent to browser code. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!authorizedWorker(request)) return new Response(null, { status: 401 });
  if (process.env.PHOTON_DEMO_TEXTS !== "true") return NextResponse.json({ error: "Synthetic texting is disabled" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { action?: PhotonTextAction; authorized?: boolean };
  if (body.authorized !== true || !["REQUEST_STATEMENT", "NOTIFY_PATIENT"].includes(body.action ?? "")) return new Response(null, { status: 400 });
  const store = getStore();
  const id = (await context.params).id;
  const current = store.get(id);
  if (!current) return new Response(null, { status: 404 });
  let text: ReturnType<typeof photonText>;
  try { text = photonText(current, body.action!); }
  catch { return NextResponse.json({ error: "Case is not eligible for this synthetic message" }, { status: 409 }); }
  const key = `${id}:${body.action}`;
  if (!store.beginText(key) && !store.retryText(key)) {
    const existing = store.textStatus(key);
    return NextResponse.json(existing, { status: existing?.status === "ACCEPTED" ? 200 : 409 });
  }
  try {
    const messageId = await sendPhotonText(text.phone, text.text);
    store.finishText(key, messageId);
    return NextResponse.json({ status: "ACCEPTED", messageId, deliveryConfirmed: false });
  } catch (error) {
    if (error instanceof PhotonSendUncertainError) {
      store.finishText(key);
      return NextResponse.json({ error: "Message acceptance is uncertain; inspect Spectrum before retrying", requiresRecovery: true }, { status: 502 });
    }
    store.failText(key);
    return NextResponse.json({ error: "Message was never sent; safe to retry", requiresRecovery: false }, { status: 502 });
  }
}
