import type { CaseStore } from "../../lib/db";
import type { MedicalBillCase } from "../../types/domain";
import type { BankProvider } from "../banking/provider";
import type { MedicalRecordProvider } from "../medical/provider";
import type { CommunicationProvider } from "../communications/provider";
import { getScenario, type Scenario } from "../scenarios";
import { resolveCommand } from "./command";
import { openScenarioCase } from "./open-scenario";
import { investigateCase, ContactAmbiguousError } from "./orchestrator";
import { mutateCase } from "./case-operation";

export interface CommandProviders { bank(scenarioId: string): BankProvider; medical: MedicalRecordProvider; communications: CommunicationProvider }
/** Where a command came from; the message ID (never a phone number) is recorded in the audit log. */
export interface CommandOrigin { source: "Photon"; messageId: string }

export type CommandOutcome =
  | { kind: "started"; case: MedicalBillCase; scenario: Scenario; patient: string; resumed: boolean }
  | { kind: "ambiguous"; options: Scenario[] }
  | { kind: "unknown" };

/**
 * Shared by the web command box and the Photon text path. The instruction is the patient's request
 * to collect records and the itemized bill only; it never approves the later hospital-billing review.
 * Provider/open failures throw (the caller maps them); unknown and ambiguous texts start nothing.
 */
export async function runAgentCommand(store: CaseStore, input: { text?: string; scenarioId?: string }, providers: CommandProviders, origin?: CommandOrigin): Promise<CommandOutcome> {
  const picked = input.scenarioId ? getScenario(input.scenarioId) : undefined;
  const resolved = picked ? { kind: "match" as const, scenario: picked } : resolveCommand(String(input.text ?? ""));
  if (resolved.kind !== "match") return resolved;
  const { scenario } = resolved;
  const opened = await openScenarioCase(store, scenario, providers.bank(scenario.id));
  const investigated = opened.case.status === "DETECTED"
    ? await mutateCase(store, opened.case.id, (latest) => {
      const next = investigateCase(latest, providers.medical, providers.communications);
      return origin ? next.then((done) => recordOrigin(done, origin)) : next;
    }, (error) => error instanceof ContactAmbiguousError)
    : opened.case;
  return { kind: "started", case: investigated, scenario, patient: `${scenario.patient.firstName} ${scenario.patient.lastName}`, resumed: opened.resumed };
}

function recordOrigin(current: MedicalBillCase, origin: CommandOrigin): MedicalBillCase {
  const timestamp = new Date().toISOString();
  current.auditLog.push({ id: crypto.randomUUID(), timestamp, action: "PHOTON_COMMAND", tool: "photonCommand", inputSummary: origin.messageId, outputSummary: "Patient text started record and itemized-bill collection only; billing review still needs separate approval", status: "SUCCESS" });
  current.timeline.push({ id: crypto.randomUUID(), timestamp, title: "Patient asked by text", detail: "An iMessage from the patient started the investigation", source: origin.source, status: "complete" });
  return current;
}
