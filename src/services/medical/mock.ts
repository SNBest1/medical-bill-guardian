import { demoRecords } from "../demo";
import type { Transaction } from "../../types/domain";
import type { MedicalRecordProvider } from "./provider";

export class MockMedicalRecordProvider implements MedicalRecordProvider {
  /** Returns patient-authorized demo records near the payment date. */
  async getMedicalRecords(transaction: Transaction) {
    if (transaction.id !== "nessie-demo-4820") throw new Error("The demo fixture supports only the seeded University Hospital payment");
    return demoRecords;
  }
}
