import type { MedicalRecord, Transaction } from "../../types/domain";

export interface MedicalRecordProvider {
  /** Honest description of where records come from, recorded on the case when set. */
  readonly sourceLabel?: string;
  getMedicalRecords(transaction: Transaction): Promise<MedicalRecord[]>;
}
