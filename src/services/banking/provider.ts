import type { Transaction } from "../../types/domain";

export interface BankProvider { getTransactions(): Promise<Transaction[]> }

/** Uses the category or merchant name to identify a likely healthcare payment. */
export function isHealthcareTransaction(transaction: Transaction): boolean {
  return transaction.category?.toLowerCase() === "healthcare" || /hospital|medical|clinic|health|radiology|emergency/i.test(transaction.merchant);
}
