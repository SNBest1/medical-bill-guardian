"use client";
import { useEffect, useState } from "react";
import { Landmark, ArrowDownLeft } from "lucide-react";
import type { MedicalBillCase } from "@/types/domain";
import { scenarios } from "@/services/scenarios";
import type { demoBankHistory } from "@/services/banking/demo-history";
type LocalHistory = NonNullable<ReturnType<typeof demoBankHistory>>;
type History = Omit<LocalHistory, "entries"> & { source?: "nessie" | "local"; notice?: string; reportedBalance?: number; entries: (LocalHistory["entries"][number] & { status?: string })[] };

const money = (amount: number) => amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function BankHistory({ caseData }: { caseData?: MedicalBillCase }) {
  const [selected, setSelected] = useState(scenarios[0].id);
  const scenarioId = caseData?.scenarioId ?? selected;
  const [loaded, setLoaded] = useState<{ scenarioId: string; bank: History } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const r = await fetch(`/api/bank-history/${scenarioId}`, { cache: "no-store" });
        if (!r.ok) throw new Error("Bank history unavailable; retrying.");
        const bank: History = await r.json();
        if (!cancelled) { setLoaded({ scenarioId, bank }); setError(""); }
      } catch { if (!cancelled) setError("Bank history unavailable; retrying."); }
      finally { pending = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [scenarioId, caseData?.recovery?.status]);
  const bank = loaded?.scenarioId === scenarioId ? loaded.bank : null;
  const tabs = !caseData && <div className="gx-bank-tabs" role="group" aria-label="Choose a bank history">{scenarios.map((scenario) => <button key={scenario.id} type="button" aria-pressed={scenarioId === scenario.id} onClick={() => setSelected(scenario.id)}>{scenario.patient.firstName}</button>)}</div>;
  if (!bank) return <section className="gx-bank" aria-label="Bank history">{tabs}<p role="status">{error || "Reading the bank account…"}</p></section>;
  const live = bank.source === "nessie";
  return <section id="demo-bank-history" className="gx-bank" aria-label="Demo bank transaction history">
    <div className="gx-bank-heading"><div><span className="gx-kicker">THE MONEY IN YOUR ACCOUNT</span><h2><Landmark size={22}/> {bank.account}</h2><p>{live ? "Nessie sandbox account" : "Local fictional account"} · ending {bank.suffix} · no real money moves</p></div><div className="gx-bank-balance" aria-live="polite"><span>Balance left</span><strong>{money(bank.balance)}</strong>{bank.refund > 0 && <small><ArrowDownLeft size={15}/> +{money(bank.refund)} refund received</small>}</div></div>
    {tabs}
    {error && <p role="status">{error} Showing the last successful read.</p>}
    {bank.notice && <p className="gx-bank-pending">{bank.notice}</p>}
    <div className="gx-bank-summary"><div><span>Hospital payment</span><strong>−{money(bank.charged)}</strong></div><div><span>Refund received</span><strong className={bank.refund ? "credit" : ""}>{bank.refund ? "+" : ""}{money(bank.refund)}</strong></div><div><span>Net paid to hospital</span><strong>{money(bank.netPaid)}</strong></div></div>
    {bank.pendingRefund > 0 && <p className="gx-bank-pending">{money(bank.pendingRefund)} refund pending. Your balance increases when the credit arrives.</p>}
    {bank.refund > 0 && bank.afterCharge !== null && <p className="gx-bank-difference" role="status">Balance after hospital payment: {money(bank.afterCharge)} → {money(bank.balance)} now. You got {money(bank.refund)} back.</p>}
    {live && typeof bank.reportedBalance === "number" && <details className="gx-bank-source"><summary>How this balance is calculated</summary><p>Fictional starting funds: {money(bank.opening!)}. Add completed deposits and subtract completed or pending payments. The separate balance field Nessie reports ({money(bank.reportedBalance)}) does not automatically change with transactions in this sandbox.</p></details>}
    <div className="gx-bank-table"><table><caption>Recent transactions{bank.opening !== null ? ` · opening balance ${money(bank.opening)}` : " · from Nessie"}</caption><thead><tr><th scope="col">Date</th><th scope="col">Transaction</th><th scope="col">Amount</th><th scope="col">Balance left after</th></tr></thead><tbody>{bank.entries.map((entry) => <tr key={entry.id} className={entry.kind === "refund" ? "gx-bank-refund" : ""}><td>{date(entry.date)}</td><th scope="row">{entry.label}{entry.kind === "refund" && <small>Credit posted in {live ? "Nessie" : "demo"}</small>}{entry.kind === "hospital" && <small>Original hospital payment</small>}{entry.status && <small>{entry.status}</small>}</th><td className={entry.amount > 0 ? "credit" : ""}>{entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}</td><td>{entry.balance === null ? "—" : money(entry.balance)}</td></tr>)}</tbody></table></div>
  </section>;
}
