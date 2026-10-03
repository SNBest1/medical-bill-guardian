import type { Transaction } from "../../types/domain";

export interface BankProvider { getTransactions(): Promise<Transaction[]> }

/** Uses the category or merchant name to identify a likely healthcare payment. This is a heuristic,
 * not verified hospital identity, so unattended case creation also checks isApprovedMerchant. */
export function isHealthcareTransaction(transaction: Transaction): boolean {
  return transaction.category?.toLowerCase() === "healthcare" || /hospital|medical|clinic|health|radiology|emergency/i.test(transaction.merchant);
}

/** Explicit merchant verification for automatic/unattended discovery. GUARDIAN_APPROVED_MERCHANTS is a
 * comma-separated allowlist of exact merchant names; if unset, no extra verification is enforced (the
 * category/name heuristic alone gates case creation, as before). */
export function isApprovedMerchant(transaction: Transaction): boolean {
  const allowlist = (process.env.GUARDIAN_APPROVED_MERCHANTS ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length === 0) return true;
  return allowlist.includes(transaction.merchant.trim().toLowerCase());
}
