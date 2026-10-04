import { loadEnvFile } from "node:process";
import { readFileSync } from "node:fs";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}
const seed = JSON.parse(readFileSync("data/nessie-seed.json", "utf8"));
const base = process.env.NESSIE_BASE_URL;
const key = process.env.NESSIE_API_KEY;
if (!key || new URL(base).hostname !== "prod-api.nessieisreal.com" || process.env.DEMO_MODE === "false") throw new Error("Configured Nessie demo sandbox required");
async function call(path, method = "GET", body) {
 const url = new URL(path, base); url.searchParams.set("key", key);
 const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
 if (!r.ok) throw new Error(`Nessie ${method} failed: ${r.status}`);
 return r.json();
}
const histories = [
 ["morgan-wellness", "2026-07-13", 2400, "Payroll deposit", "2026-07-16", 86, "Groceries"],
 ["harriet-kidney", "2026-01-15", 1850, "Pension deposit", "2026-01-18", 49, "Pharmacy"],
 ["theo-asthma", "2025-03-17", 900, "Family deposit", "2025-03-20", 66, "School supplies"],
];
for (const [id, depositDate, deposit, depositLabel, expenseDate, expense, expenseLabel] of histories) {
 const ids = seed[id]; if (!ids) throw new Error(`Missing seeded ${id} account`);
 for (const [type, date, amount, label] of [["deposits", depositDate, deposit, depositLabel], ["withdrawals", expenseDate, expense, expenseLabel]]) {
  const path = `/accounts/${ids.accountId}/${type}`;
  const description = `Guardian history v1 · ${label}`;
  const entries = await call(path);
  if (!entries.some((entry) => entry.description === description)) await call(path, "POST", { medium: "balance", transaction_date: date, status: "completed", amount, description });
  const verified = (await call(path)).filter((entry) => entry.description === description);
  if (verified.length !== 1 || verified[0].amount !== amount) throw new Error(`History verification failed for ${id}`);
 }
 const account = (await call(`/customers/${ids.customerId}/accounts`)).find((a) => a._id === ids.accountId);
 console.log(JSON.stringify({ patient: id, historyVerified: true, nessieBalance: account.balance }));
}
