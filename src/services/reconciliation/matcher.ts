import type { MedicalRecord, Transaction } from "../../types/domain";

/** Finds a provider encounter shortly before the healthcare payment. */
export function matchEncounter(transaction: Transaction, records: MedicalRecord[]): MedicalRecord | null {
  const merchant = transaction.merchant.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const paid = Date.parse(`${transaction.date}T00:00:00Z`);
  return records.find((record) => {
    if (record.type !== "encounter") return false;
    const provider = record.provider.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const days = (paid - Date.parse(`${record.date}T00:00:00Z`)) / 86400000;
    return (provider.includes(merchant) || merchant.includes(provider)) && days >= 0 && days <= 14;
  }) ?? null;
}
