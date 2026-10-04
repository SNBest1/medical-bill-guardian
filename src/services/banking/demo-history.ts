import type { MedicalBillCase } from "../../types/domain";
import { getScenario } from "../scenarios";

const profiles: Record<string, { opening: number; deposit: number; depositLabel: string; expense: number; expenseLabel: string; suffix: string; account: string }> = {
  "morgan-wellness": { opening: 2200, deposit: 2400, depositLabel: "Payroll deposit", expense: 86.42, expenseLabel: "Groceries", suffix: "1842", account: "Morgan’s checking" },
  "harriet-kidney": { opening: 4100, deposit: 1850, depositLabel: "Pension deposit", expense: 48.75, expenseLabel: "Pharmacy", suffix: "6031", account: "Harriet’s checking" },
  "theo-asthma": { opening: 1600, deposit: 900, depositLabel: "Family deposit", expense: 65.50, expenseLabel: "School supplies", suffix: "9274", account: "Theo’s parent-managed account" },
};
export const demoOpeningBalance = (scenarioId: string) => profiles[scenarioId]?.opening ?? 0;
const cents = (amount: number) => Math.round(amount * 100);
function previousDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

/** Fictional account history. A refund enters the ledger only after the saved case records receipt. */
export function demoBankHistory(scenarioId: string, caseData?: MedicalBillCase | null) {
  const scenario = getScenario(scenarioId);
  const profile = profiles[scenarioId];
  if (!scenario || !profile) return null;
  const current = caseData?.scenarioId === scenarioId ? caseData : null;
  const payment = current?.transaction ?? scenario.transaction;
  const refund = current?.recovery?.status === "REFUND_RECEIVED" ? cents(current.recovery.amount) : 0;
  const beforeCharge = cents(profile.opening) + cents(profile.deposit) - cents(profile.expense);
  const afterCharge = beforeCharge - cents(payment.amount);
  const entries = [
    { id: `${scenarioId}-deposit`, date: previousDate(payment.date, 5), label: profile.depositLabel, amount: profile.deposit, balance: (cents(profile.opening) + cents(profile.deposit)) / 100, kind: "deposit" },
    { id: `${scenarioId}-expense`, date: previousDate(payment.date, 2), label: profile.expenseLabel, amount: -profile.expense, balance: beforeCharge / 100, kind: "expense" },
    { id: payment.id, date: payment.date, label: payment.merchant, amount: -payment.amount, balance: afterCharge / 100, kind: "hospital" },
  ];
  if (refund > 0) entries.push({ id: current?.recovery?.creditTransactionId ?? `${payment.id}-refund`, date: current?.auditLog.findLast((entry) => entry.action === "VERIFY_DEMO_CREDIT")?.timestamp.slice(0, 10) ?? current!.updatedAt.slice(0, 10), label: `${payment.merchant} · refund`, amount: refund / 100, balance: (afterCharge + refund) / 100, kind: "refund" });
  return { account: profile.account, suffix: profile.suffix, opening: profile.opening, beforeCharge: beforeCharge / 100, afterCharge: afterCharge / 100, balance: (afterCharge + refund) / 100, charged: payment.amount, refund: refund / 100, netPaid: (cents(payment.amount) - refund) / 100, pendingRefund: current?.recovery?.status === "REFUND_PENDING" ? current.recovery.amount : 0, entries: entries.reverse() };
}
