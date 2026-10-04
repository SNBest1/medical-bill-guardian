import type { MedicalRecord, RecordSource, Transaction } from "../../types/domain";

export interface RetrievedRecords { records: MedicalRecord[]; source: RecordSource }

export interface MedicalRecordProvider {
  /** Honest description of where records come from, recorded on the case when set. */
  readonly sourceLabel?: string;
  /** When present, the orchestrator uses this instead of getMedicalRecords so the case records exactly how the records were obtained (live pull or fallback). */
  retrieve?(transaction: Transaction): Promise<RetrievedRecords>;
  getMedicalRecords(transaction: Transaction): Promise<MedicalRecord[]>;
}
