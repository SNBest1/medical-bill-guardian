import type { RecordInput } from "./types";

const DAY_MS = 86_400_000;
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

/** Finds a provider encounter up to 14 days before the payment. Dates are compared as UTC calendar days. */
export function matchEncounter(payment: { merchant: string; date: string }, records: RecordInput[]): RecordInput | null {
  const merchant = normalize(payment.merchant);
  const paid = Date.parse(`${payment.date}T00:00:00Z`);
  return records.find((record) => {
    if (record.kind !== "encounter") return false;
    const provider = normalize(record.provider);
    const days = (paid - Date.parse(`${record.date}T00:00:00Z`)) / DAY_MS;
    return (provider.includes(merchant) || merchant.includes(provider)) && days >= 0 && days <= 14;
  }) ?? null;
}
