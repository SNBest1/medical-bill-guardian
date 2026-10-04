import type { CaseStore } from "../../lib/db";
import type { BankProvider } from "../banking/provider";
import { discoverHospitalPayments } from "../banking/discovery";
import type { MedicalBillCase } from "../../types/domain";
import { getScenario, type Scenario } from "../scenarios";

export class ScenarioOpenError extends Error { constructor(message: string, readonly status: number) { super(message); } }

/** Reads the picked patient's hospital payment from the bank and opens (or resumes) its case,
 * recording the selection in the case's audit log and timeline. */
export async function openScenarioCase(store: CaseStore, scenario: Scenario, bank: BankProvider): Promise<{ case: MedicalBillCase; resumed: boolean }> {
  if (!store.selectPatient(scenario.id)) {
    const active = store.activeCase();
    throw new ScenarioOpenError(`One patient at a time. Continue ${(active?.scenarioId ? getScenario(active.scenarioId)?.patient.firstName : undefined) ?? "the current patient"} before starting ${scenario.patient.firstName}.`, 409);
  }
  let cases: MedicalBillCase[];
  try { ({ cases } = await discoverHospitalPayments(store, bank)); }
  catch (error) { store.releaseUnopenedPatient(scenario.id); throw error; }
  const opened = cases[0];
  if (!opened) { store.releaseUnopenedPatient(scenario.id); throw new ScenarioOpenError("The bank returned no matching hospital payment for this patient", 502); }
  if (opened.scenarioId) { store.attachActiveCase(opened); return { case: opened, resumed: true }; }
  const token = store.acquireOperation(opened.id);
  if (!token) throw new ScenarioOpenError("A case operation is active. Try again in a moment.", 409);
  try {
    const now = new Date().toISOString();
    const selected = structuredClone(opened);
    selected.scenarioId = scenario.id;
    selected.auditLog.push({ id: crypto.randomUUID(), timestamp: now, action: "SELECT_SCENARIO", tool: "selectScenario", inputSummary: scenario.id, outputSummary: `${scenario.patient.firstName} ${scenario.patient.lastName} · ${scenario.hospital.name}`, status: "SUCCESS" });
    selected.timeline.push({ id: crypto.randomUUID(), timestamp: now, title: "Patient selected", detail: `${scenario.label}. ${scenario.story}`, source: "Patient", status: "complete" });
    selected.updatedAt = now;
    store.save(selected);
    store.attachActiveCase(selected);
    return { case: selected, resumed: false };
  } finally { store.releaseOperation(opened.id, token); }
}
