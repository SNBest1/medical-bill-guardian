import type { CaseStore } from "../../lib/db";
import type { MedicalBillCase } from "../../types/domain";
import { PhotonSendUncertainError, sendPhotonText, safePhotonError } from "../communications/photon-text";
import type { TextSender } from "./patient-command";
import { getScenario } from "../scenarios";

export type ProgressMilestone = "RECORDS_FOUND" | "BILL_REQUESTED" | "REVIEW_NEEDED" | "HOSPITAL_CONTACTED" | "OUTCOME" | "REFUND_OFFER" | "REFUND_RECEIVED";

/** Opt-in switch shared by the sender and the reply logic so the patient is never texted twice for one step. */
export const progressUpdatesEnabled = () => process.env.PHOTON_UPDATE_TEXTS === "true" && process.env.DEMO_MODE !== "false";

const money = (amount: number) => `$${amount.toLocaleString()}`;

/** The one milestone the case is at right now, with a fixed template built only from structured case facts. Earlier milestones the case skipped past are never sent late. */
export function currentMilestone(c: MedicalBillCase): { milestone: ProgressMilestone; text: string } | null {
  const patient = c.scenarioId ? getScenario(c.scenarioId)?.patient.firstName : undefined;
  const who = patient ? `${patient}’s ${c.provider.name}` : c.provider.name;
  if (c.recovery?.status === "REFUND_RECEIVED" && c.recovery.bankSource === "nessie") return { milestone: "REFUND_RECEIVED", text: `Update on your ${who} bill: a ${money(c.recovery.amount)} refund deposit is verified in the Nessie sandbox. ${c.recovery.calculatedBalanceAfter === undefined ? "Calculated demo balance is unavailable; check the bank history." : `Calculated demo balance left: ${money(c.recovery.calculatedBalanceAfter)}.`} No real money moved.` };
  if (c.recovery?.status === "REFUND_RECEIVED") return { milestone: "REFUND_RECEIVED", text: `Update on your ${who} bill: the ${money(c.recovery.amount)} demo refund credit has arrived (synthetic, no real money moved). This case is closed.` };
  switch (c.status) {
    case "REQUESTING_BILL": return { milestone: "RECORDS_FOUND", text: `Update on your ${who} bill: I found ${c.medicalRecords.length} medical ${c.medicalRecords.length === 1 ? "record" : "records"} from around your ${money(c.transaction.amount)} payment. May I call the demo hospital to request the itemized bill? Tell me "yes, request the itemized bill" or "hold off". This authorizes that call only. Nothing has been sent to the hospital yet.` };
    case "WAITING_FOR_BILL": return { milestone: "BILL_REQUESTED", text: `Update on your ${who} bill: I asked hospital billing for the itemized statement. I'm waiting for it and will text you the moment it arrives.` };
    case "REVIEW_REQUIRED": {
      const flagged = c.findings.filter((finding) => finding.action === "REQUEST_REVIEW");
      const supported = c.findings.filter((finding) => finding.clinicalStatus === "SUPPORTED").length;
      return { milestone: "REVIEW_NEEDED", text: `Update on your ${who} bill: the itemized bill arrived and I checked all ${c.findings.length} charges. ${supported} match your records. ${flagged.length} (${money(flagged.reduce((sum, finding) => sum + finding.amount, 0))}) I couldn't verify, which isn't proof of an error. May I call hospital billing to ask them to verify ${flagged.length === 1 ? "that charge" : "those charges"}? Tell me "yes, call them and review the bill" or "hold off". I'll only request a review; I won't approve payments.` };
    }
    case "WAITING_FOR_PROVIDER": return { milestone: "HOSPITAL_CONTACTED", text: `Update on your ${who} bill: you approved the review and I've contacted hospital billing. They haven't given a final answer yet; I'll text you when they do.` };
    case "USER_NOTIFIED": {
      const r = c.resolution;
      if (c.recovery?.status === "REFUND_PENDING" && c.recovery.simulated) return { milestone: "REFUND_OFFER", text: `Update on your ${who} bill: hospital billing corrected the bill${r ? ` from ${money(r.originalTotal)} to ${money(r.correctedTotal)}` : ""}. Your ${money(c.recovery.amount)} demo refund is ready. Want me to send the demo credit back now? Tell me "send the refund" or "hold off". This is a synthetic credit; no real money moves.` };
      return { milestone: "OUTCOME", text: r ? `Update on your ${who} bill: hospital billing responded. Your bill went from ${money(r.originalTotal)} to ${money(r.correctedTotal)}${r.adjustment > 0 ? ` (${money(r.adjustment)} correction)` : ""}. Text STATUS any time for an update.` : `Update on your ${who} bill: the review is finished. Text STATUS any time for an update.` };
    }
    default: return null;
  }
}

export function progressTextKey(c: MedicalBillCase): string | null {
  const update = currentMilestone(c);
  return update ? `${c.id}:${c.auditLog[0]?.id ?? c.createdAt}:update:${update.milestone}` : null;
}

export function progressAccepted(store: CaseStore, c: MedicalBillCase): boolean {
  const key = progressTextKey(c);
  const status = key ? store.textStatus(key)?.status : undefined;
  return status === "ACCEPTED" || status === "UNCERTAIN" || status === "SENDING";
}

/**
 * Texts the approved patient phone once per milestone (idempotent via the Photon outbox) so they
 * hear from the agent at each step. Opt-in with PHOTON_UPDATE_TEXTS plus PHOTON_DEMO_TEXTS. Never
 * throws: an update must not fail the case operation that triggered it. An uncertain send is never
 * resent; a send that never left this process is retried on the next call.
 */
export async function sendProgressUpdate(store: CaseStore, c: MedicalBillCase, send: TextSender = sendPhotonText): Promise<"sent" | "skipped" | "uncertain" | "failed"> {
  if (!progressUpdatesEnabled()) return "skipped";
  const active = store.activeCase();
  if (active && active.id !== c.id) return "skipped";
  const phone = process.env.DEMO_PATIENT_PHONE;
  const update = currentMilestone(c);
  if (!phone || !update) return "skipped";
  const key = progressTextKey(c)!;
  if (!store.beginText(key) && !store.retryText(key)) return "skipped";
  try {
    store.finishText(key, await send(phone, update.text));
    return "sent";
  } catch (error) {
    if (error instanceof PhotonSendUncertainError) { store.finishText(key); return "uncertain"; }
    store.failText(key, safePhotonError(error));
    return "failed";
  }
}

/** Catch-all sweep for transitions that happen outside a request (inbound texted bills, background processing). */
export async function sendPendingProgressUpdates(store: CaseStore, send?: TextSender): Promise<number> {
  let sent = 0;
  for (const c of store.list()) if (await sendProgressUpdate(store, c, send) === "sent") sent += 1;
  return sent;
}
