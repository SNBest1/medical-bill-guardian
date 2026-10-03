"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, CircleDollarSign, HeartPulse, Play, ShieldCheck, Sparkles } from "lucide-react";
import type { MedicalBillCase } from "@/types/domain";

const money = (value: number) => `$${value.toLocaleString()}`;
const label = (status: string) => status === "USER_NOTIFIED" ? "Review complete" : status === "REVIEW_REQUIRED" ? "Needs your review" : status === "DETECTED" ? "Ready to investigate" : "Investigating";

export function Dashboard({ demo }: { demo: boolean }) {
  const [cases, setCases] = useState<MedicalBillCase[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { const response = await fetch("/api/cases"); if (response.ok) setCases(await response.json()); }, []);
  useEffect(() => { if (demo) void scan(); else void refresh(); }, [demo, refresh]);

  async function scan() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/transactions/scan", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Transaction scan failed");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scan failed"); }
    finally { setBusy(false); }
  }

  const protectedSpend = cases.reduce((sum, item) => sum + item.transaction.amount, 0);
  const confirmedSavings = cases.reduce((sum, item) => sum + (item.resolution?.adjustment ?? 0), 0);
  const needsReview = cases.filter((item) => item.status === "REVIEW_REQUIRED").length;
  return <div className="shell">
    <header className="topbar"><Link href="/" className="brand"><span className="brand-mark"><HeartPulse size={20} strokeWidth={2.4} /></span><span>medical bill <strong>guardian</strong></span></Link><div className="topbar-right"><span className="topbar-note">Your healthcare, clearly accounted for.</span>{demo && <span className="demo-pill"><span /> Demo mode</span>}</div></header>
    <main className="main dashboard">
      <section className="hero-grid"><div className="hero-copy"><div className="eyebrow"><ShieldCheck size={15} /> A smarter second look</div><h1>Every charge<br /><em>deserves context.</em></h1><p>We connect a hospital payment to your medical record, review each line of the bill, and help you ask the right questions.</p><button className="primary-button" onClick={scan} disabled={busy}><Play size={16} fill="currentColor" /> {busy ? "Scanning transactions…" : cases.length ? "Scan again" : "Detect hospital payment"} <ArrowRight size={17} /></button>{error && <p className="error-text" role="alert">{error}</p>}</div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-card"><div className="hero-card-top"><span className="tiny-dots"><i/><i/><i/></span><span>PAYMENT SIGNAL</span></div><div className="signal-line"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="hero-card-bottom"><span>Transaction detected</span><strong>→</strong><span>Clarity delivered</span></div></div><span className="floating-cross">+</span></div></section>
      <section className="metric-row" aria-label="Overview"><div className="metric"><span className="metric-icon teal"><CircleDollarSign size={19} /></span><span className="metric-label">Protected spend</span><strong>{money(protectedSpend)}</strong><small>Hospital payments being reviewed</small></div><div className="metric"><span className="metric-icon blue"><ShieldCheck size={19} /></span><span className="metric-label">Cases</span><strong>{cases.length.toString().padStart(2, "0")}</strong><small>{needsReview ? `${needsReview} waiting for your approval` : cases.length ? "Your reviews, all in one place" : "No cases yet"}</small></div><div className="metric"><span className="metric-icon amber"><Sparkles size={19} /></span><span className="metric-label">Confirmed corrections</span><strong>{money(confirmedSavings)}</strong><small>Only after provider confirmation</small></div></section>
      <section className="cases-section"><div className="section-heading"><div><span className="section-kicker">YOUR CASES</span><h2>Billing investigations</h2></div><span className="section-count">{cases.length} total</span></div>{cases.length ? <div className="case-list">{cases.map((item) => <Link href={`/cases/${item.id}`} className="case-card" key={item.id}><div className="case-logo"><HeartPulse size={23} /></div><div className="case-info"><strong>{item.provider.name}</strong><span>{new Date(`${item.transaction.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} <b>·</b> {item.id}</span></div><div className="case-amount">{money(item.transaction.amount)}<span>Original payment</span></div><div className={`status-tag ${item.status === "REVIEW_REQUIRED" ? "attention" : item.status === "USER_NOTIFIED" ? "complete" : ""}`}><span /> {label(item.status)}</div><ArrowUpRight className="case-arrow" size={21} /></Link>)}</div> : <div className="empty-state"><div className="empty-icon"><ShieldCheck size={28} /></div><h3>Your next review starts with a payment.</h3><p>Scan your connected demo account to find the University Hospital charge.</p><button className="secondary-button" onClick={scan} disabled={busy}>Scan transactions <ArrowRight size={16} /></button></div>}</section>
      <footer className="footer"><span>Medical Bill Guardian</span><span><Check size={14} /> Questions first. Confirmation before conclusions.</span></footer>
    </main>
  </div>;
}
