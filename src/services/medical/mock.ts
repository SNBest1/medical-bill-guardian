import { scenarioForTransaction } from "../scenarios";
import type { Transaction } from "../../types/domain";
import { caseRecords } from "./finchnode-demo";
import { savedSnapshot } from "./finchnode-fixtures";
import type { MedicalRecordProvider } from "./provider";

export class MockMedicalRecordProvider implements MedicalRecordProvider {
  /** Returns the patient-authorized synthetic records for the payment's scenario, from the saved FinchNode copy when the scenario has a FinchNode patient. */
  async getMedicalRecords(transaction: Transaction) {
    const scenario = scenarioForTransaction(transaction);
    if (!scenario) throw new Error("The demo fixture supports only the seeded scenario payments");
    const saved = scenario.finchSubject ? savedSnapshot(scenario.finchSubject) : undefined;
    return saved ? caseRecords(saved, transaction) : scenario.records;
  }
}
