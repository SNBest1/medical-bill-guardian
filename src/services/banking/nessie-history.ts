import { readFileSync } from "node:fs";
import { demoOpeningBalance } from "./demo-history";
import { getScenario } from "../scenarios";
import type { MedicalBillCase } from "../../types/domain";

export type SeededAccount = { accountId: string; customerId: string; purchaseId: string };
export function seededAccount(scenarioId: string): SeededAccount {
  const entry = JSON.parse(readFileSync("data/nessie-seed.json", "utf8"))[scenarioId];
  if (!entry?.accountId || !entry.customerId || !entry.purchaseId) throw new Error("Patient account has not been seeded");
  return entry;
}
export async function nessieCall<T>(path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const base = process.env.NESSIE_BASE_URL;
  const key = process.env.NESSIE_API_KEY;
  if (process.env.DEMO_MODE === "false" || !key || !base || new URL(base).origin !== "https://prod-api.nessieisreal.com") throw new Error("Configured Nessie demo sandbox required");
  const url = new URL(path, base); url.searchParams.set("key", key);
  const r = await fetcher(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Nessie request failed (${r.status})`);
  return r.json() as Promise<T>;
}
export type NessieEntry = { _id: string; amount: number; description?: string; status: string; transaction_date?: string; purchase_date?: string };
export type NessieAccount = { _id: string; nickname: string; account_number?: string; balance: number };
export async function readNessieAccount(ids: SeededAccount, fetcher: typeof fetch = fetch) {
  const list = await nessieCall<NessieAccount[]>(`/customers/${ids.customerId}/accounts`, {}, fetcher);
  const account = list.find((a) => a._id === ids.accountId);
  if (!account || !Number.isFinite(account.balance)) throw new Error("Nessie account balance unavailable");
  return account;
}
export async function nessieBankHistory(scenarioId: string, current?: MedicalBillCase | null, fetcher: typeof fetch = fetch) {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error("Unknown patient");
  const ids = seededAccount(scenarioId);
  const [account, purchases, deposits, withdrawals] = await Promise.all([
    readNessieAccount(ids, fetcher),
    nessieCall<NessieEntry[]>(`/accounts/${ids.accountId}/purchases`, {}, fetcher),
    nessieCall<NessieEntry[]>(`/accounts/${ids.accountId}/deposits`, {}, fetcher),
    nessieCall<NessieEntry[]>(`/accounts/${ids.accountId}/withdrawals`, {}, fetcher),
  ]);
  const payment = purchases.find((p) => p._id === ids.purchaseId);
  if (!payment) throw new Error("Original Nessie hospital purchase unavailable");
  const refundDescription = `Guardian refund · ${ids.purchaseId}`;
  const credits = deposits.filter((d) => d.description === refundDescription && d.status === "completed");
  const refund = credits.reduce((total, d) => total + d.amount, 0);
  const entries = [
    ...purchases.map((p) => ({ id: p._id, date: p.purchase_date!, label: p._id === ids.purchaseId ? scenario.hospital.name : p.description ?? "Purchase", amount: -p.amount, balance: 0, kind: p._id === ids.purchaseId ? "hospital" : "expense", status: p.status })),
    ...deposits.map((d) => ({ id: d._id, date: d.transaction_date!, label: d.description === refundDescription ? `${scenario.hospital.name} · refund` : d.description?.replace("Guardian history v1 · ", "") ?? "Deposit", amount: d.amount, balance: 0, kind: d.description === refundDescription ? "refund" : "deposit", status: d.status })),
    ...withdrawals.map((w) => ({ id: w._id, date: w.transaction_date!, label: w.description?.replace("Guardian history v1 · ", "") ?? "Withdrawal", amount: -w.amount, balance: 0, kind: "expense", status: w.status })),
  ].sort((a, b) => a.date.localeCompare(b.date) || Number(a.kind === "refund") - Number(b.kind === "refund"));
  const opening = demoOpeningBalance(scenarioId);
  let remaining = Math.round(opening * 100);
  for (const entry of entries) {
    // Reserve pending debits; count incoming funds only after they are completed.
    const counted = entry.status === "completed" || (entry.amount < 0 && entry.status === "pending");
    if (counted) remaining += Math.round(entry.amount * 100);
    entry.balance = remaining / 100;
  }
  const balance = remaining / 100;
  const afterCharge = Math.round((balance - refund) * 100) / 100;
  entries.reverse();
  return { source: "nessie" as const, account: scenarioId === "theo-asthma" ? "Theo’s parent-managed account" : account.nickname, suffix: account.account_number?.slice(-4) ?? ids.accountId.slice(-4), opening, beforeCharge: Math.round((afterCharge + payment.amount) * 100) / 100, afterCharge, balance, reportedBalance: account.balance, charged: payment.amount, refund, netPaid: Math.round((payment.amount - refund) * 100) / 100, pendingRefund: current?.recovery?.status === "REFUND_PENDING" && refund === 0 ? current.recovery.amount : 0, entries, notice: "Balance left is calculated from fictional starting funds and Nessie transaction history. Pending payments are reserved; deposits count when completed." };
}
