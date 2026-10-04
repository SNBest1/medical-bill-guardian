"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, HeartPulse, LoaderCircle, Mic, ShieldCheck } from "lucide-react";

const money = (value: number) => `$${value.toLocaleString()}`;

type ScenarioCard = { id: string; label: string; accident: string; patient: string; hospital: string; amount: number; date: string };
type Recognition = { start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; lang: string };

export function Dashboard({ demo }: { demo: boolean }) {
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [focus, setFocus] = useState<ScenarioCard | null>(null);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => { fetch("/api/scenarios").then((response) => response.json()).then((list: ScenarioCard[]) => { setScenarios(list); setFocus(list[0] ?? null); }).catch(() => undefined); }, []);

  /** Sends the instruction (or a clicked card) to the agent, then opens the case it started. */
  async function send(body: { text?: string; scenarioId?: string }) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/agent/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "The agent could not start");
      window.location.assign(`/cases/${data.case.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The agent could not start"); setBusy(false); }
  }
  function listen() {
    if (listening) { recognition.current?.stop(); return; }
    const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!Ctor) { setError("Voice input isn't supported in this browser. Type the instruction instead."); return; }
    const heard = new Ctor(); heard.lang = "en-US"; recognition.current = heard; setError("");
    heard.onresult = (event) => { const text = event.results[0][0].transcript; setCommand(text); void send({ text }); };
    heard.onend = () => setListening(false); heard.onerror = () => { setListening(false); setError("I couldn't hear that. Try again or type it."); };
    setListening(true); heard.start();
  }
  const money_ = focus ?? { hospital: "University Hospital", amount: 4820, date: "2026-09-28" };
  const shown = new Date(`${money_.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return <div className="gx-shell gx-landing-shell">
    <header className="gx-header"><Link href="/" className="gx-brand"><span><HeartPulse size={18}/></span>Medical Bill Guardian</Link><div className="gx-header-meta"><span>Interactive demo · Synthetic patient</span>{demo && <b>Demo mode</b>}</div></header>
    <main className="gx-landing">
      <section className="gx-landing-hero">
        <div className="gx-landing-copy"><span className="gx-kicker">AFTER THE HOSPITAL</span><h1>You paid the bill.<br/><em>Did you owe it?</em></h1><p>Guardian checks each charge against your records, helps you ask billing the right question, and tracks what happens next.</p><form className="gx-command" onSubmit={(event) => { event.preventDefault(); if (command.trim()) void send({ text: command }); }}><label htmlFor="agent-command">Tell Guardian which bill to look into</label><div><input id="agent-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Investigate Maya's hospital bill" disabled={busy} autoComplete="off"/><button type="button" className="gx-mic" onClick={listen} disabled={busy} aria-label={listening ? "Stop listening" : "Speak the instruction"} aria-pressed={listening}><Mic size={18}/></button><button className="gx-landing-cta" disabled={busy || !command.trim()}>{busy ? <LoaderCircle className="spin" size={19}/> : null} {busy ? "Starting…" : "Investigate"}<ArrowRight size={20}/></button></div></form><div className="gx-picks" role="group" aria-label="Or choose an accident">{scenarios.map((card) => <button key={card.id} disabled={busy} onMouseEnter={() => setFocus(card)} onFocus={() => setFocus(card)} onClick={() => void send({ scenarioId: card.id })}><strong>{card.label}</strong><span>{card.patient} · {money(card.amount)}</span></button>)}</div><a href="#how-it-works" className="gx-landing-link">How it works <ArrowRight size={15}/></a>{error && <p className="gx-error" role="alert">{error}</p>}</div>
        <div className="gx-bill-preview" aria-label={`Synthetic ${money_.hospital} statement`}><div className="gx-paid-stub"><span>PAYMENT</span><strong>PAID</strong><small>{shown}</small></div><div className="gx-preview-paper"><div className="gx-paper-head"><span>{money_.hospital.toUpperCase()}</span><small>SYNTHETIC</small></div><p>{focus ? focus.accident.split(".")[0] : "Emergency care after an accident"}</p><div className="gx-paper-lines"><span/><span/><span/><span/><span/><span className="question"/></div><div className="gx-paper-total"><span>PAID TOTAL</span><strong>{money(money_.amount)}</strong></div></div><div className="gx-preview-caption"><ShieldCheck size={15}/> One case. Every charge. Evidence you can inspect.</div></div>
      </section>
      <section className="gx-how" id="how-it-works"><div><span className="gx-kicker">A SECOND LOOK THAT FOLLOWS THROUGH</span><h2>Understand. Ask. Track.</h2><p>A confusing bill creates work at exactly the wrong time. Guardian brings the payment, statement, and available records into one traceable case.</p></div><ol><li><span>01</span><div><strong>Understand the bill</strong><p>See each charge beside the record that supports it.</p></div></li><li><span>02</span><div><strong>Approve the question</strong><p>You decide before Guardian contacts the simulated billing desk.</p></div></li><li><span>03</span><div><strong>Track the result</strong><p>A correction, refund owed, and refund received stay separate.</p></div></li></ol></section>
      <section className="gx-context"><strong>41<span>%</span></strong><p>of U.S. adults reported medical or dental debt in KFF’s 2022 survey.</p><a href="https://www.kff.org/health-costs/kff-health-care-debt-survey/" target="_blank" rel="noreferrer">Read the KFF survey <ArrowUpRight size={14}/></a></section>
      <footer className="gx-footer"><span><Check size={15}/> Synthetic patient. Simulated billing desk. No real money moves.</span><span>Evidence first. You stay in control.</span></footer>
    </main>
  </div>;
}
