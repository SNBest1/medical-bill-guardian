import type { CaseStore } from "../../lib/db";
import type { MedicalBillCase } from "../../types/domain";
import { receiveDemoRefund } from "../agent/orchestrator";
import { nessieBankHistory, nessieCall, readNessieAccount, seededAccount, type NessieEntry } from "./nessie-history";

export class NessieRefundUncertainError extends Error {}

/** Posts one sandbox deposit for a corrected payment. A reset never creates a second credit. */
export async function receiveBankRefund(store: CaseStore, current: MedicalBillCase, fetcher: typeof fetch = fetch): Promise<MedicalBillCase> {
  if (process.env.NESSIE_SANDBOX_DISCOVERY !== "true") return receiveDemoRefund(current);
  if (current.recovery?.status === "REFUND_RECEIVED" && current.recovery.bankSource === "nessie") return current;
  // Validate the existing approval, completed review and exact correction before contacting Nessie.
  const next = receiveDemoRefund(current);
  if (!current.scenarioId) throw new Error("Patient account is missing");
  const ids = seededAccount(current.scenarioId);
  if (current.transaction.id !== ids.purchaseId) throw new Error("Refund must match the seeded Nessie payment");
  const amount = current.recovery!.amount;
  const description = `Guardian refund · ${ids.purchaseId}`;
  const path = `/accounts/${ids.accountId}/deposits`;
  let attempt = store.bankRefundAttempt(ids.purchaseId);
  if (attempt && attempt.amount !== amount) throw new Error("A different refund amount was already attempted for this payment");
  let credits = (await nessieCall<NessieEntry[]>(path, {}, fetcher)).filter((d) => d.description === description);
  if (!credits.length) {
    if (attempt) throw new NessieRefundUncertainError("A refund was already attempted. Check Nessie before retrying; no second credit was posted.");
    const account = await readNessieAccount(ids, fetcher);
    if (!store.claimBankRefund(ids.purchaseId, amount, account.balance)) throw new NessieRefundUncertainError("Refund already in progress");
    attempt = { amount, balance_before: account.balance };
    try {
      await nessieCall(path, { method: "POST", body: JSON.stringify({ medium: "balance", transaction_date: new Date().toISOString().slice(0, 10), status: "completed", amount, description }) }, fetcher);
      credits = (await nessieCall<NessieEntry[]>(path, {}, fetcher)).filter((d) => d.description === description);
    } catch { throw new NessieRefundUncertainError("Nessie credit acceptance is unconfirmed. Check the bank history before retrying."); }
  }
  if (credits.length !== 1 || credits[0].amount !== amount || credits[0].status !== "completed") throw new NessieRefundUncertainError("Nessie refund amount or status could not be verified");
  const account = await readNessieAccount(ids, fetcher);
  next.recovery = { ...next.recovery!, creditTransactionId: credits[0]._id, bankSource: "nessie", balanceBefore: attempt?.balance_before, balanceAfter: account.balance, confirmation: "Refund deposit verified in Nessie sandbox" };
  // A verified deposit remains received even if its history cannot be read.
  // Keep the provider-reported balance for audit; patient messages use the same
  // calculated demo balance as the bank-history screen.
  try {
    next.recovery.calculatedBalanceAfter = (await nessieBankHistory(current.scenarioId, next, fetcher)).balance;
  } catch { /* Do not invent a balance or retry a verified credit. */ }
  const balanceMessage = next.recovery.calculatedBalanceAfter === undefined
    ? "Calculated demo balance is unavailable; check the bank history."
    : `Calculated demo balance left: $${next.recovery.calculatedBalanceAfter.toLocaleString()}.`;
  const timestamp = new Date().toISOString();
  next.auditLog = next.auditLog.filter((a) => a.action !== "VERIFY_DEMO_CREDIT");
  next.auditLog.push({ id: crypto.randomUUID(), timestamp, action: "VERIFY_NESSIE_CREDIT", tool: "readNessieDeposit", inputSummary: current.transaction.id, outputSummary: `Verified sandbox deposit of $${amount}; account balance $${account.balance}`, status: "SUCCESS" });
  next.timeline = next.timeline.filter((entry) => entry.title !== "Demo refund received");
  next.timeline.push({ id: crypto.randomUUID(), timestamp, title: "Nessie refund credit posted", detail: `$${amount} deposit verified in Nessie. ${balanceMessage} No real money moved.`, source: "Nessie sandbox", status: "complete" });
  next.summary = `${current.summary ?? ""} A $${amount} refund deposit is verified in the Nessie sandbox. ${balanceMessage} No real money moved.`;
  next.updatedAt = timestamp;
  return next;
}
