import type { CaseStore } from "../../lib/db";
import { scenarios } from "../scenarios";
import { PhotonSendUncertainError, sendPhotonText } from "../communications/photon-text";
import type { PatientCommand } from "../communications/photon-command";
import { ContactAmbiguousError } from "./orchestrator";
import { handlePatientDecision } from "./patient-decision";
import { progressUpdatesEnabled } from "./progress-updates";
import { runAgentCommand, type CommandProviders } from "./run-command";

export type ReplyState = "disabled" | "sent" | "uncertain" | "failed";
export type PatientCommandResult = { kind: "duplicate" } | { kind: "started" | "ambiguous" | "unknown" | "approved" | "declined" | "status" | "nothing-pending" | "failed"; reply: ReplyState };
export type TextSender = (phone: string, text: string) => Promise<string>;

/** Fixed templates only: arbitrary patient text is never echoed back. */
function replyText(outcome: Awaited<ReturnType<typeof runAgentCommand>>): string {
  // A real hospital call needs the patient's explicit approval, so say how to give it instead of implying it was placed. With progress updates on, the records-found update carries that instruction.
  if (outcome.kind === "started" && outcome.case.status === "REQUESTING_BILL") return progressUpdatesEnabled() ? `Looking into ${outcome.scenario.patient.firstName}'s hospital bill now. I'll text you at each step.` : `Started the investigation into ${outcome.scenario.patient.firstName}'s hospital bill. Reply YES to authorize the call to hospital billing.`;
  if (outcome.kind === "started") return `Starting the investigation into ${outcome.scenario.patient.firstName}'s hospital bill now.`;
  const names = (outcome.kind === "ambiguous" ? outcome.options : scenarios).map((scenario) => scenario.patient.firstName);
  return `Which bill: ${names.join(" or ")}?`;
}

/**
 * Handles one accepted patient text. Redelivered message IDs do nothing. A command start counts as
 * authorization to collect records and the itemized bill only. The optional reply goes to the
 * approved patient phone only, once, through the same outbox idempotency as other Photon texts.
 */
export async function handlePatientCommand(store: CaseStore, command: PatientCommand, providers: CommandProviders, options: { replyEnabled: boolean; patientPhone: string; send?: TextSender }): Promise<PatientCommandResult> {
  if (!store.claimCommand(command.messageId)) return { kind: "duplicate" };
  const decision = await handlePatientDecision(store, command.text, providers.communications).catch(() => null);
  if (decision) {
    store.finishCommand(command.messageId, decision.kind.toUpperCase());
    if (!options.replyEnabled || !decision.text) return { kind: decision.kind, reply: "disabled" };
    return { kind: decision.kind, reply: await sendReply(store, `command:${command.messageId}:reply`, options, decision.text) };
  }
  let outcome: Awaited<ReturnType<typeof runAgentCommand>>;
  try { outcome = await runAgentCommand(store, { text: command.text }, providers, { source: "Photon", messageId: command.messageId }); }
  catch (error) {
    // An ambiguous provider contact must not be retried automatically; anything else may be.
    if (!(error instanceof ContactAmbiguousError)) store.releaseCommand(command.messageId);
    throw error;
  }
  store.finishCommand(command.messageId, outcome.kind.toUpperCase());
  if (!options.replyEnabled) return { kind: outcome.kind, reply: "disabled" };
  return { kind: outcome.kind, reply: await sendReply(store, `command:${command.messageId}:reply`, options, replyText(outcome)) };
}

async function sendReply(store: CaseStore, key: string, options: { patientPhone: string; send?: TextSender }, text: string): Promise<ReplyState> {
  if (!store.beginText(key)) return "disabled";
  try {
    store.finishText(key, await (options.send ?? sendPhotonText)(options.patientPhone, text));
    return "sent";
  } catch (error) {
    if (error instanceof PhotonSendUncertainError) { store.finishText(key); return "uncertain"; }
    store.failText(key);
    return "failed";
  }
}
