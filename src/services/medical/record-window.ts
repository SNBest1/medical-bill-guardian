import type { MedicalRecord, Transaction } from "../../types/domain";
import { matchesServiceWindow, normalizeFinchRecords, type FinchSnapshot } from "./finchnode";

/** Keeps only records tied to this case's encounter: same organization, within one day of the service date (the payment date). */
export function caseRecords(snapshot: FinchSnapshot, transaction: Transaction): MedicalRecord[] {
  return normalizeFinchRecords(snapshot).filter((record) => matchesServiceWindow(record, transaction.merchant, transaction.date, 1));
}

export const countByCategory = (records: MedicalRecord[]) => records.reduce<Record<string, number>>((counts, record) => {
  const key = record.category ?? record.type;
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
