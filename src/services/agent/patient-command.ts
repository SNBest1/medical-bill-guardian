import type { CaseStore } from "../../lib/db";
import { scenarios } from "../scenarios";
import { PhotonSendUncertainError, sendPhotonText } from "../communications/photon-text";
import type { PatientCommand } from "../communications/photon-command";
import { ContactAmbiguousError } from "./orchestrator";
import { handlePatientDecision } from "./patient-decision";
import { ScenarioOpenError } from "./open-scenario";
import { runAgentCommand, type CommandProviders } from "./run-command";

import { currentMilestone } from "./progress-updates";
import { safePhotonError } from "../communications/photon-text";

export type ReplyState = "disabled" | "sent" | "uncertain" | "failed";
export type PatientCommandResult = { kind: "duplicate" } | { kind: "started" | "ambiguous" | "unknown" | "approved" | "declined" | "status" | "nothing-pending" | "failed"; reply: ReplyState };
export type TextSender = (phone: string, text: string) => Promise<string>;

/** Fixed templates only: arbitrary patient text is never echoed back. */
function replyText(outcome: Awaited<ReturnType<typeof runAgentCommand>>): string {
  // The direct reply must explain the approval gate even if a separate progress update fails or the worker is stopped.
  if (outcome.kind === "started" && outcome.case.status === "REQUESTING_BILL") return `I retrieved ${outcome.case.medicalRecords.length} available medical records for ${outcome.scenario.patient.firstName}'s bill. I'm waiting for your approval; no hospital call has been placed. Reply YES ${outcome.scenario.patient.firstName} to authorize a real call to the demo hospital to request the itemized bill, or NO ${outcome.scenario.patient.firstName} to hold off.`;
  if (outcome.kind === "started" && outcome.resumed) return currentMilestone(outcome.case)?.text ?? `Your ${outcome.scenario.patient.firstName} investigation is saved at ${outcome.case.status.toLowerCase().replaceAll("_", " ")}. Reply STATUS for an update or I’M DONE to leave.`;
  if (outcome.kind === "started") return `Starting the investigation into ${outcome.scenario.patient.firstName}'s hospital bill now.`;
  const names = (outcome.kind === "ambiguous" ? outcome.options : scenarios).map((scenario) => scenario.patient.firstName);
  return outcome.kind === "unknown" ? `I couldn’t understand that request. I can investigate ${names.join(", ")}’s demo bills. Try “investigate Harriet”, reply STATUS for an update, or I’M DONE to leave.` : `Which bill: ${names.join(" or ")}?`;
}

/**
 * Handles each accepted patient message. Redelivery retries only a definitely failed reply,
 * never the case action. A command start counts as
 * authorization to collect records and the itemized bill only. The optional reply goes to the
 * approved patient phone only, once, through the same outbox idempotency as other Photon texts.
 */
export async function handlePatientCommand(store: CaseStore, command: PatientCommand, providers: CommandProviders, options: { replyEnabled: boolean; patientPhone: string; send?: TextSender }): Promise<PatientCommandResult> {
  const replyKey = `command:${command.messageId}:reply`;
  if (!store.claimCommand(command.messageId)) {
    const text = store.patientReply(replyKey);
    if (options.replyEnabled && text) await sendReply(store, replyKey, options, text);
    return { kind: "duplicate" };
  }
  const respond = async (kind: Exclude<PatientCommandResult["kind"], "duplicate">, text: string): Promise<PatientCommandResult> => {
    store.finishCommand(command.messageId, kind.toUpperCase());
    store.queuePatientReply(replyKey, text);
    return { kind, reply: options.replyEnabled ? await sendReply(store, replyKey, options, text) : "disabled" };
  };
  if (command.unsupported) return respond("unknown", command.unsupported === "too-long" ? "That message is too long for me to process. Please send a shorter request, such as investigate Harriet, STATUS, or I’M DONE." : "I couldn’t read that message. Please send a text request, such as investigate Harriet, STATUS, or I’M DONE.");
  let decision;
  try { decision = await handlePatientDecision(store, command.text, providers.communications); }
  catch { return respond("failed", "I couldn’t process that reply. No new action is confirmed. Try STATUS or open the case page."); }
  if (decision) {
    return respond(decision.kind, decision.text ?? (store.activeCase() ? currentMilestone(store.activeCase()!)?.text : null) ?? "Your reply was processed. Reply STATUS for the current step, or I’M DONE to leave.");
  }
  let outcome: Awaited<ReturnType<typeof runAgentCommand>>;
  try { outcome = await runAgentCommand(store, { text: command.text }, providers, { source: "Photon", messageId: command.messageId }); }
  catch (error) {
    if (error instanceof ScenarioOpenError && error.status === 409) {
      return respond("failed", `${error.message} Reply I’M DONE to leave the current investigation, then investigate Harriet (or another patient).`);
    }
    return respond("failed", error instanceof ContactAmbiguousError
      ? "I couldn’t confirm whether the hospital was contacted. I won’t place another call automatically. Open the case page to check, or reply I’M DONE to leave."
      : "I couldn’t complete your investigation request. No result is confirmed. Try the request again, reply STATUS, or I’M DONE to leave.");
  }
  return respond(outcome.kind, replyText(outcome));
}

async function sendReply(store: CaseStore, key: string, options: { patientPhone: string; send?: TextSender }, text: string): Promise<ReplyState> {
  store.queuePatientReply(key, text);
  if (!store.beginText(key) && !store.retryText(key)) return "disabled";
  try {
    store.finishText(key, await (options.send ?? sendPhotonText)(options.patientPhone, text));
    return "sent";
  } catch (error) {
    if (error instanceof PhotonSendUncertainError) { store.finishText(key); return "uncertain"; }
    store.failText(key, safePhotonError(error));
    return "failed";
  }
}

/** Retry only definite pre-send failures; accepted, in-flight and uncertain sends are not repeated. */
export async function sendPendingPatientReplies(store: CaseStore, options: { replyEnabled: boolean; patientPhone: string; send?: TextSender }): Promise<number> {
  if (!options.replyEnabled) return 0;
  let sent = 0;
  for (const reply of store.pendingPatientReplies()) {
    if (await sendReply(store, reply.key, options, reply.text) === "sent") sent += 1;
  }
  return sent;
}
