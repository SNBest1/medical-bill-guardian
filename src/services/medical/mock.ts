import { scenarioForTransaction } from "../scenarios";
import type { Transaction } from "../../types/domain";
import type { MedicalRecordProvider } from "./provider";

export class MockMedicalRecordProvider implements MedicalRecordProvider {
  /** Returns the patient-authorized synthetic records for the payment's scenario. */
  async getMedicalRecords(transaction: Transaction) {
    const scenario = scenarioForTransaction(transaction);
    if (!scenario) throw new Error("The demo fixture supports only the seeded scenario payments");
    return scenario.records;
  }
}
