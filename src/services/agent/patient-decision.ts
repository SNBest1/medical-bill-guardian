import type { CaseStore } from "../../lib/db";
import type { MedicalBillCase } from "../../types/domain";
import type { CommunicationProvider } from "../communications/provider";
import { getScenario } from "../scenarios";
import { mutateCase, CaseBusyError } from "./case-operation";
import { notifyCase, requestItemizedBill, reviewCase } from "./orchestrator";
import { classifyPatientReply, type PatientIntent } from "./patient-intent";
import { receiveBankRefund, NessieRefundUncertainError } from "../banking/nessie-refund";
import { currentMilestone, progressAccepted } from "./progress-updates";

export type DecisionOutcome = { kind: "approved" | "declined" | "status" | "nothing-pending" | "ambiguous" | "failed"; text: string | null };

const firstName = (c: MedicalBillCase) => (c.scenarioId ? getScenario(c.scenarioId)?.patient.firstName : undefined) ?? c.provider.name;
/** A call waiting for approval, or a flagged bill waiting for the billing-review approval. */
const awaitingDecision = (c: MedicalBillCase) => (c.status === "REQUESTING_BILL" && !c.communications.some((item) => item.type === "ITEMIZED_BILL_REQUEST")) || c.status === "REVIEW_REQUIRED" || (c.status === "USER_NOTIFIED" && c.recovery?.simulated === true && c.recovery.status === "REFUND_PENDING");

/** A review approval means contacting the hospital: an error after that point is ambiguous and keeps the case guard for operator recovery. */
class ReviewContactError extends Error {}

/**
 * Executes a patient's text reply ("yes", "no", "status"). Approval comes only from the approved
 * patient phone (the caller enforces that) and only ever applies to the step the case is paused at,
 * the same two gates the case page offers. Returns null when the text isn't a decision at all.
 */
export async function handlePatientDecision(store: CaseStore, text: string, communications: CommunicationProvider): Promise<DecisionOutcome | null> {
  const intent: PatientIntent = classifyPatientReply(text);
  if (!intent) return null;
  const selected = store.activeCase();
  if (intent.kind === "leave") {
    if (selected) store.leaveCase(selected.id);
    return { kind: "declined", text: "Okay, you've left the investigation. Your case is saved, and you can choose another bill. A call already placed can still finish." };
  }
  const cases = selected ? [selected] : [];
  if (intent.kind === "status") {
    const active = cases.filter((c) => c.status !== "USER_NOTIFIED" && c.status !== "FAILED").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? cases.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!active) return { kind: "nothing-pending", text: "I'm not working on any bills yet. Text me something like \"look into Morgan's bill\" to start." };
    return { kind: "status", text: currentMilestone(active)?.text ?? `Update on your ${active.provider.name} bill: I'm working on it now (${active.status.toLowerCase().replaceAll("_", " ")}). I'll text you at the next step.` };
  }
  const refundPending = selected?.status === "USER_NOTIFIED" && selected.recovery?.simulated === true && selected.recovery.status === "REFUND_PENDING";
  if (intent.kind === "refund" && !refundPending) return { kind: "nothing-pending", text: selected?.recovery?.status === "REFUND_RECEIVED" ? "Your demo refund credit has already been recorded. No second credit was sent." : "There is no approved demo refund ready to send. Text STATUS for the current step." };
  const waiting = cases.filter(awaitingDecision);
  const named = intent.name ? waiting.filter((c) => firstName(c).toLowerCase() === intent.name) : waiting;
  if (waiting.length === 0) return { kind: "nothing-pending", text: "Nothing is waiting on your approval right now. Text \"status\" for an update." };
  if (named.length === 0) return { kind: "ambiguous", text: `Which bill: ${waiting.map(firstName).join(" or ")}? Tell me which patient you mean.` };
  if (named.length > 1) return { kind: "ambiguous", text: `Several bills are waiting: ${named.map(firstName).join(", ")}. Tell me which patient you mean.` };
  const target = named[0];
  if (intent.kind === "approve" && intent.action && (refundPending || (intent.action === "review" && target.status !== "REVIEW_REQUIRED") || (intent.action === "request-bill" && target.status !== "REQUESTING_BILL"))) {
    return { kind: "ambiguous", text: `That isn't the step waiting for approval. ${currentMilestone(target)?.text ?? "Reply STATUS to see the current step."}` };
  }
  if (refundPending && intent.kind === "decline") return { kind: "declined", text: `Okay, I'll hold the demo refund credit for ${firstName(target)}. Tell me "send the refund" when you're ready.` };
  if (intent.kind === "decline") {
    return { kind: "declined", text: `Okay, I won't contact the hospital about ${firstName(target)}'s bill. Nothing has been sent. Tell me "go ahead" if you change your mind.` };
  }
  try {
    if (refundPending) {
      const next = await mutateCase(store, target.id, (latest) => receiveBankRefund(store, latest), (error) => error instanceof NessieRefundUncertainError);
      return { kind: "approved", text: progressAccepted(store, next) ? null : currentMilestone(next)!.text };
    }
    if (target.status === "REQUESTING_BILL") {
      await mutateCase(store, target.id, (latest) => requestItemizedBill(latest, communications, true));
      return { kind: "approved", text: progressAccepted(store, store.get(target.id)!) ? null : `Approved. I'm calling hospital billing for ${firstName(target)}'s itemized bill now.` };
    }
    await mutateCase(store, target.id, async (latest) => {
      let reviewed: MedicalBillCase;
      try { reviewed = await reviewCase(latest, communications, true); } catch (error) { throw new ReviewContactError(String(error)); }
      return reviewed.status === "RESOLVED" ? notifyCase(reviewed, communications) : reviewed;
    }, (error) => error instanceof ReviewContactError);
    return { kind: "approved", text: progressAccepted(store, store.get(target.id)!) ? null : `Approved. I've asked hospital billing to review ${firstName(target)}'s bill.` };
  } catch (error) {
    if (error instanceof NessieRefundUncertainError) return { kind: "failed", text: "Nessie has not confirmed the refund credit. I won’t send another credit automatically. Check the bank history and case page before retrying." };
    if (error instanceof CaseBusyError) return { kind: "failed", text: "I'm already working on that step. I'll text you when it's done." };
    return { kind: "failed", text: "I couldn't complete that step, and nothing was confirmed with the hospital. Reply \"yes\" to try again, or open the case page." };
  }
}
