import type { MedicalBillCase } from "../../types/domain";

export type PhotonTextAction = "REQUEST_STATEMENT" | "NOTIFY_PATIENT";

/** Fixed synthetic templates keep real clinical data out of this hackathon transport. */
export function photonText(caseData: MedicalBillCase, action: PhotonTextAction): { phone: string; text: string } {
  if (process.env.DEMO_MODE === "false" || caseData.transaction.id !== "nessie-demo-4820") throw new Error("Photon texts are restricted to the seeded synthetic case");
  if (action === "REQUEST_STATEMENT") {
    if (caseData.status !== "WAITING_FOR_BILL") throw new Error("Authorize collection and start the case before requesting a statement");
    return { phone: process.env.DEMO_HOSPITAL_PHONE ?? "", text: `Medical Bill Guardian — synthetic hackathon rehearsal. Please reply with the fictional itemized statement using this exact opening:\nCase: ${caseData.id}\nSynthetic demo statement\nInvoice: UH-48291\nProvider: University Hospital\nService date: 2026-09-28\nThen Charges, one description | code or - | amount per line, and Total: 4820.00. Do not send real patient information.` };
  }
  if (caseData.status !== "USER_NOTIFIED" || !caseData.summary) throw new Error("A saved outcome is required before sending the patient summary");
  return { phone: process.env.DEMO_PATIENT_PHONE ?? "", text: `Medical Bill Guardian — synthetic hackathon rehearsal, no real money moved.\nCase: ${caseData.id}\n${caseData.summary}` };
}

/**
 * Thrown once the SDK call has actually started — the send may or may not have reached the
 * provider. Callers must treat this as uncertain (require operator recovery, never silently
 * resend) rather than as a definite failure. A plain `Error` thrown before this point means the
 * attempt never left this process and is always safe to retry.
 */
export class PhotonSendUncertainError extends Error {
  constructor(message: string) { super(message); this.name = "PhotonSendUncertainError"; }
}

export interface PhotonConnection {
  send(phone: string, text: string): Promise<{ id?: string } | undefined>;
  stop(): Promise<void>;
}

/** Real Spectrum Cloud connection; swapped out in tests via `sendPhotonText`'s `connect` parameter. */
async function connectSpectrum(projectId: string, projectSecret: string): Promise<PhotonConnection> {
  const [{ Spectrum }, { imessage }] = await Promise.all([import("spectrum-ts"), import("spectrum-ts/providers/imessage")]);
  const app = await Spectrum({ projectId, projectSecret, telemetry: false, options: { logLevel: "error" }, providers: [imessage.config()] });
  const im = imessage(app);
  return {
    send: async (phone, text) => { const user = await im.user(phone); const space = await im.space.create(user); return space.send(text); },
    stop: () => app.stop(),
  };
}

/** Stable SDK sends over cloud iMessage. A returned ID is acceptance, not proof of delivery. */
export async function sendPhotonText(phone: string, text: string, connect: (projectId: string, projectSecret: string) => Promise<PhotonConnection> = connectSpectrum): Promise<string> {
  if (process.env.PHOTON_DEMO_TEXTS !== "true") throw new Error("Enable PHOTON_DEMO_TEXTS only for an approved synthetic rehearsal");
  const approved = [process.env.DEMO_HOSPITAL_PHONE, process.env.DEMO_PATIENT_PHONE];
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !approved.includes(phone) || Buffer.byteLength(text) > 8192) throw new Error("Invalid demo recipient or text");
  const projectId = process.env.SPECTRUM_PROJECT_ID;
  const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
  if (!projectId || !projectSecret) throw new Error("Spectrum credentials are missing");
  let connection: PhotonConnection;
  try { connection = await connect(projectId, projectSecret); }
  catch (error) { throw new Error(`Could not start the Spectrum connection: ${error instanceof Error ? error.message : String(error)}`); }
  try {
    const message = await connection.send(phone, text);
    if (!message?.id) throw new PhotonSendUncertainError("Spectrum did not confirm message acceptance");
    return message.id;
  } catch (error) {
    if (error instanceof PhotonSendUncertainError) throw error;
    throw new PhotonSendUncertainError(error instanceof Error ? error.message : String(error));
  } finally {
    // Cleanup cannot turn an accepted or uncertain send into a retryable failure.
    try { await connection.stop(); } catch { console.error("Photon connection cleanup failed"); }
  }
}

/** Keep provider diagnostics useful without retaining credentials or routing identifiers. */
export function safePhotonError(error: unknown): string {
  let message = error instanceof Error ? error.message : "Unknown text failure";
  for (const [key, value] of Object.entries(process.env)) {
    if (value && /SECRET|TOKEN|KEY|PHONE|LINE|USER_ID|PROJECT_ID/.test(key)) message = message.split(value).join("[redacted]");
  }
  return message.replace(/\+\d{8,15}/g, "[phone]").slice(0, 500);
}
