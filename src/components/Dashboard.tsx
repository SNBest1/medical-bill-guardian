"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, FileSearch, HeartPulse, LoaderCircle, ShieldCheck } from "lucide-react";
import type { MedicalBillCase } from "@/types/domain";

const money = (value: number) => `$${value.toLocaleString()}`;

export function Dashboard({ demo }: { demo: boolean }) {
  const [cases, setCases] = useState<MedicalBillCase[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { const response = await fetch("/api/cases", { cache: "no-store" }); if (response.ok) setCases(await response.json()); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function openDemo() {
    if (cases[0]) { window.location.assign(`/cases/${cases[0].id}`); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/transactions/scan", { method: "POST" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "The demo case could not be opened");
      await refresh(); window.location.assign(`/cases/${data.cases?.[0]?.id ?? "CASE-4821"}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The demo case could not be opened"); setBusy(false); }
  }
  const current = cases[0];
  return <div className="gx-shell gx-landing-shell">
    <header className="gx-header"><Link href="/" className="gx-brand"><span><HeartPulse size={18}/></span>Medical Bill Guardian</Link><div className="gx-header-meta"><span>Interactive demo · Synthetic patient</span>{demo && <b>Demo mode</b>}</div></header>
    <main className="gx-landing">
      <section className="gx-landing-hero">
        <div className="gx-landing-copy"><span className="gx-kicker">AFTER THE HOSPITAL</span><h1>You paid the bill.<br/><em>Did you owe it?</em></h1><p>Guardian checks each charge against your records, helps you ask billing the right question, and tracks what happens next.</p><button className="gx-landing-cta" disabled={busy} onClick={() => void openDemo()}>{busy ? <LoaderCircle className="spin" size={19}/> : <FileSearch size={19}/>} {busy ? "Opening the case…" : current ? "Resume demo case" : "Open demo case"}<ArrowRight size={20}/></button><a href="#how-it-works" className="gx-landing-link">How it works <ArrowRight size={15}/></a>{error && <p className="gx-error" role="alert">{error}</p>}</div>
        <div className="gx-bill-preview" aria-label="Synthetic University Hospital statement"><div className="gx-paid-stub"><span>PAYMENT</span><strong>PAID</strong><small>Sep 28, 2026</small></div><div className="gx-preview-paper"><div className="gx-paper-head"><span>UNIVERSITY HOSPITAL</span><small>UH-48291</small></div><p>Emergency care after an accident</p><div className="gx-paper-lines"><span/><span/><span/><span/><span/><span className="question"/></div><div className="gx-paper-total"><span>PAID TOTAL</span><strong>{money(4820)}</strong></div></div><div className="gx-preview-caption"><ShieldCheck size={15}/> One case. Six charges. Evidence you can inspect.</div></div>
      </section>
      <section className="gx-how" id="how-it-works"><div><span className="gx-kicker">A SECOND LOOK THAT FOLLOWS THROUGH</span><h2>Understand. Ask. Track.</h2><p>A confusing bill creates work at exactly the wrong time. Guardian brings the payment, statement, and available records into one traceable case.</p></div><ol><li><span>01</span><div><strong>Understand the bill</strong><p>See each charge beside the record that supports it.</p></div></li><li><span>02</span><div><strong>Approve the question</strong><p>You decide before Guardian contacts the simulated billing desk.</p></div></li><li><span>03</span><div><strong>Track the result</strong><p>A correction, refund owed, and refund received stay separate.</p></div></li></ol></section>
      <section className="gx-context"><strong>41<span>%</span></strong><p>of U.S. adults reported medical or dental debt in KFF’s 2022 survey.</p><a href="https://www.kff.org/health-costs/kff-health-care-debt-survey/" target="_blank" rel="noreferrer">Read the KFF survey <ArrowUpRight size={14}/></a></section>
      <footer className="gx-footer"><span><Check size={15}/> Synthetic patient. Simulated billing desk. No real money moves.</span><span>Evidence first. You stay in control.</span></footer>
    </main>
  </div>;
}
