import { NextResponse, after } from "next/server";
import { getStore } from "@/lib/db";
import { authorizedWorker } from "@/services/agent/worker-auth";
import { parseLocalPatientMessage } from "@/services/communications/photon-command";
import { handlePatientCommand } from "@/services/agent/patient-command";
import { bankProvider, communicationProvider, medicalProvider } from "@/lib/providers";
import { parseLocalBillLinkMessage } from "@/services/communications/photon-bill-link";
import { defaultBillLinkDeps, processBillLink } from "@/services/agent/read-bill-link";
import { parseLocalPhotonMessage, type LocalPhotonMessage, type LocalPhotonSpace } from "@/services/communications/photon-receiver";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 131072;

/**
 * Alternative to the public signed webhook: a worker-token-authenticated local process
 * (scripts/photon-receiver.mjs) holds the live Spectrum connection and forwards each inbound
 * hospital DM here over loopback. No HMAC is checked — the trust boundary is the worker token,
 * the same one /api/integrations/tick uses — but the message still passes the identical sender,
 * DM, platform and grammar checks the webhook enforces, and lands in the same durable inbox, so
 * duplicates between the two transports (e.g. a webhook later registered for the same project)
 * dedupe against each other by Spectrum's own message ID.
 */
export async function POST(request: Request) {
  if (!authorizedWorker(request)) return new Response(null, { status: 401 });
  if (process.env.DEMO_MODE === "false") return new Response(null, { status: 503 });
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  try {
    const body = JSON.parse(raw) as { space?: LocalPhotonSpace; message?: LocalPhotonMessage };
    const entry = parseLocalPhotonMessage(body.space ?? {}, body.message ?? ({} as LocalPhotonMessage), process.env.DEMO_HOSPITAL_PHONE ?? "");
    if (!entry) {
      const billLink = parseLocalBillLinkMessage(body.space ?? {}, body.message ?? ({} as LocalPhotonMessage), process.env.DEMO_HOSPITAL_PHONE ?? "");
      if (billLink) {
        // The hospital texted a PDF link. Acknowledge now (the receiver times out after 10s) and read the bill in the background so the case page can show each step live.
        const store = getStore();
        if (!store.claimBillLink(billLink.messageId)) return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
        after(async () => {
          try { await processBillLink(store, billLink, defaultBillLinkDeps()); }
          catch { store.finishBillLink(billLink.messageId, "FAILED", "Unexpected error while reading the bill"); }
        });
        return NextResponse.json({ accepted: true, billLink: true }, { status: 202 });
      }
      const command = parseLocalPatientMessage(body.space ?? {}, body.message ?? ({} as LocalPhotonMessage), process.env.DEMO_PATIENT_PHONE ?? "");
      if (!command) return NextResponse.json({ accepted: false, ignored: true });
      const result = await handlePatientCommand(getStore(), command, { bank: bankProvider, medical: medicalProvider(), communications: communicationProvider() }, { replyEnabled: process.env.PHOTON_REPLY_TEXTS === "true", patientPhone: process.env.DEMO_PATIENT_PHONE ?? "" });
      return NextResponse.json({ accepted: true, command: result.kind, ...(result.kind === "duplicate" ? { duplicate: true } : { reply: result.reply }) }, { status: 202 });
    }
    const inserted = getStore().enqueueStatement(entry);
    return NextResponse.json({ accepted: true, duplicate: !inserted }, { status: 202 });
  } catch { return NextResponse.json({ error: "Invalid local statement delivery" }, { status: 400 }); }
}
