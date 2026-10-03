import type { MedicalRecord, Transaction } from "../../types/domain";

export interface MedicalRecordProvider { getMedicalRecords(transaction: Transaction): Promise<MedicalRecord[]> }
