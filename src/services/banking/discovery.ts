import type { CaseStore } from "../../lib/db";
import type { BankProvider } from "./provider";
import { isHealthcareTransaction, isApprovedMerchant } from "./provider";
import { createCase } from "../agent/orchestrator";

/** Discovery is repeatable; new payments stop at authorization before records or contact.
 * isApprovedMerchant adds an explicit verification layer on top of the category/name heuristic,
 * since merchant/category alone only means "suspected healthcare", not a verified hospital identity. */
export async function discoverHospitalPayments(store: CaseStore, bank: BankProvider) {
  const transactions = (await bank.getTransactions()).filter((transaction) =>
    Number.isFinite(transaction.amount) && transaction.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date) && isHealthcareTransaction(transaction) && isApprovedMerchant(transaction));
  const cases = transactions.map((transaction) => store.create(createCase(transaction)));
  return { cases, detected: transactions.length };
}
