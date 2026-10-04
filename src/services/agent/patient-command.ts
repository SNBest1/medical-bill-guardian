import type { CaseStore } from "../../lib/db";
import { scenarios } from "../scenarios";
import { PhotonSendUncertainError, sendPhotonText } from "../communications/photon-text";
import type { PatientCommand } from "../communications/photon-command";
import { ContactAmbiguousError } from "./orchestrator";
import { handlePatientDecision } from "./patient-decision";
import { ScenarioOpenError } from "./open-scenario";
import { runAgentCommand, type CommandProviders } from "./run-command";

import { patientChat, type ChatOptions } from "./patient-chat";
import { classifyPatientReply } from "./patient-intent";
import { currentMilestone } from "./progress-updates";
import { safePhotonError } from "../communications/photon-text";

export type ReplyState = "disabled" | "sent" | "uncertain" | "failed";
export type PatientCommandResult = { kind: "duplicate" } | { kind: "started" | "ambiguous" | "unknown" | "approved" | "declined" | "status" | "nothing-pending" | "failed" | "chat"; reply: ReplyState };
export type TextSender = (phone: string, text: string) => Promise<string>;

/** Deterministic replies for the controlled action path. General chat is separate. */
function replyText(outcome: Awaited<ReturnType<typeof runAgentCommand>>): string {
  // The direct reply must explain the approval gate even if a separate progress update fails or the worker is stopped.
  if (outcome.kind === "started" && outcome.case.status === "REQUESTING_BILL") return currentMilestone(outcome.case)!.text;
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
export async function handlePatientCommand(store: CaseStore, command: PatientCommand, providers: CommandProviders, options: { replyEnabled: boolean; patientPhone: string; send?: TextSender; conversational?: boolean; chat?: ChatOptions }): Promise<PatientCommandResult> {
  const conversational = options.conversational ?? process.env.PHOTON_CONVERSATIONAL === "true";
  let chatScenario: string | undefined;
  let confirmationGate: string | undefined;
  const replyKey = `command:${command.messageId}:reply`;
  if (!store.claimCommand(command.messageId)) {
    const text = store.patientReply(replyKey);
    if (options.replyEnabled && text) await sendReply(store, replyKey, options, text);
    return { kind: "duplicate" };
  }
  const respond = async (kind: Exclude<PatientCommandResult["kind"], "duplicate">, text: string): Promise<PatientCommandResult> => {
    if (conversational) {
      const active = store.activeCase();
      store.rememberPatientChat(command.messageId, { role: "user", text: command.text, scenarioId: chatScenario ?? active?.scenarioId });
      store.rememberPatientChat(command.messageId, { role: "assistant", text, scenarioId: chatScenario ?? active?.scenarioId, approvalGate: confirmationGate ?? (kind !== "chat" && text === (active ? currentMilestone(active)?.text : undefined) ? active?.status : undefined) });
    }
    store.finishCommand(command.messageId, kind.toUpperCase());
    store.queuePatientReply(replyKey, text);
    return { kind, reply: options.replyEnabled ? await sendReply(store, replyKey, options, text) : "disabled" };
  };
  if (command.unsupported) return respond("unknown", command.unsupported === "too-long" ? "That message is too long for me to process. Please send a shorter request, such as investigate Harriet, STATUS, or I’M DONE." : "I couldn’t read that message. Please send a text request, such as investigate Harriet, STATUS, or I’M DONE.");
  if (conversational) {
    const intent = classifyPatientReply(command.text);
    const last = store.recentPatientChat().findLast(t => t.role === "assistant");
    if ((intent?.kind === "approve" || intent?.kind === "refund") && last && last.approvalGate !== store.activeCase()?.status) {
      confirmationGate = store.activeCase()?.status;
      return respond("status", `Before I act, please confirm the proposed step. ${store.activeCase() ? currentMilestone(store.activeCase()!)?.text ?? "Nothing is awaiting approval." : "No bill is selected."}`);
    }
    // Names mentioned in ordinary conversation must never start an investigation.
    const explicitStart = /\b(?:investigate|look into)\b.*\b(?:bill|morgan|harriet|theo)\b/i.test(command.text) || /\b(?:check|review)\b.*\bbill\b/i.test(command.text) || /^(?:morgan|harriet|theo)(?:[.!])?$/i.test(command.text.trim());
    const bankInquiry = /balance|nessie|transactions?|bank history|money left/i.test(command.text);
    if (!intent && (bankInquiry || !explicitStart || /Whose account should I check/.test(last?.text ?? ""))) {
      const answer = await patientChat(store, command.text, options.chat);
      chatScenario = answer.scenarioId;
      return respond("chat", answer.text);
    }
  }
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
