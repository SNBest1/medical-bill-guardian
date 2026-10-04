import type { MedicalRecord, Transaction } from "../../types/domain";
import type { Scenario } from "../scenario-data";
import { scenarioForTransaction } from "../scenarios";
import { normalizeFinchRecords, type FinchSnapshot } from "./finchnode";
import type { MedicalRecordProvider } from "./provider";

/** Shown verbatim in the case audit log, timeline, and records panel. Never claim a live FinchNode call. */
export const SCENARIO_RECORDS_LABEL = "Records retrieved via FinchNode record format - synthetic scenario data (no live FinchNode call)";

/**
 * Re-shapes a scenario's synthetic records as a FinchNode records snapshot (categories: encounters,
 * medications, labs, diagnosticReports, documents, procedures). Nothing here is fetched from FinchNode.
 */
export function scenarioFinchSnapshot(records: MedicalRecord[]): FinchSnapshot {
  const entry = (record: MedicalRecord) => ({ id: record.id, description: record.description, date: `${record.date}T09:00:00Z`, sourceName: record.provider });
  const of = (...types: MedicalRecord["type"][]) => records.filter((record) => types.includes(record.type));
  return {
    data: {
      encounters: of("encounter").map((record) => ({ ...entry(record), type: "encounter" })),
      medications: of("medication").map(entry),
      labs: of("lab").map(entry),
      diagnosticReports: of("imaging").map((record) => ({ ...entry(record), category: "imaging" })),
      procedures: of("procedure").map(entry),
      documents: of("document").map(entry)
    }
  };
}

/**
 * Demo-mode record source. The sandbox cannot hold these patients, so the scenario's records are
 * emitted in FinchNode's snapshot shape and run through the same normalizeFinchRecords a live pull
 * uses. The live FinchNodeProvider is unchanged and is still what DEMO_MODE=false selects.
 */
export class ScenarioFinchNodeProvider implements MedicalRecordProvider {
  readonly sourceLabel = SCENARIO_RECORDS_LABEL;
  async getMedicalRecords(transaction: Transaction): Promise<MedicalRecord[]> {
    const scenario: Scenario | undefined = scenarioForTransaction(transaction);
    if (!scenario) throw new Error("The demo fixture supports only the seeded scenario payments");
    return normalizeFinchRecords(scenarioFinchSnapshot(scenario.records));
  }
}
