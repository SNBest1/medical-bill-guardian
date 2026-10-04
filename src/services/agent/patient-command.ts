import type { CaseStore } from "../../lib/db";
import { scenarios } from "../scenarios";
import { PhotonSendUncertainError, sendPhotonText } from "../communications/photon-text";
import type { PatientCommand } from "../communications/photon-command";
import { ContactAmbiguousError } from "./orchestrator";
import { runAgentCommand, type CommandProviders } from "./run-command";

export type ReplyState = "disabled" | "sent" | "uncertain" | "failed";
export type PatientCommandResult = { kind: "duplicate" } | { kind: "started" | "ambiguous" | "unknown"; reply: ReplyState };
export type TextSender = (phone: string, text: string) => Promise<string>;

/** Fixed templates only: arbitrary patient text is never echoed back. */
function replyText(outcome: Awaited<ReturnType<typeof runAgentCommand>>): string {
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
  let outcome: Awaited<ReturnType<typeof runAgentCommand>>;
  try { outcome = await runAgentCommand(store, { text: command.text }, providers, { source: "Photon", messageId: command.messageId }); }
  catch (error) {
    // An ambiguous provider contact must not be retried automatically; anything else may be.
    if (!(error instanceof ContactAmbiguousError)) store.releaseCommand(command.messageId);
    throw error;
  }
  store.finishCommand(command.messageId, outcome.kind.toUpperCase());
  if (!options.replyEnabled) return { kind: outcome.kind, reply: "disabled" };
  const key = `command:${command.messageId}:reply`;
  if (!store.beginText(key)) return { kind: outcome.kind, reply: "disabled" };
  try {
    const id = await (options.send ?? sendPhotonText)(options.patientPhone, replyText(outcome));
    store.finishText(key, id);
    return { kind: outcome.kind, reply: "sent" };
  } catch (error) {
    if (error instanceof PhotonSendUncertainError) { store.finishText(key); return { kind: outcome.kind, reply: "uncertain" }; }
    store.failText(key);
    return { kind: outcome.kind, reply: "failed" };
  }
}
