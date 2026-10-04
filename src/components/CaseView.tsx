"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, RotateCcw } from "lucide-react";
import type { MedicalBillCase } from "@/types/domain";
import { AppHeader } from "./AppHeader";
import { EvidenceWorkspace } from "./EvidenceWorkspace";
import { ReceiptTrace } from "./ReceiptTrace";
import { SystemView } from "./SystemView";
import { WorkflowRibbon } from "./WorkflowRibbon";
import { getStatusCopy } from "./case-presentation";

const money = (value: number) => `$${value.toLocaleString()}`;

export function CaseView({ id, demo }: { id: string; demo: boolean }) {
  const [caseData, setCaseData] = useState<MedicalBillCase | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"story" | "system">("story");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { const response = await fetch(`/api/cases/${id}`); if (response.ok) setCaseData(await response.json()); else setError("Case not found"); }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (caseData?.status !== "WAITING_FOR_BILL") return;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return; inFlight = true;
      try { const response = await fetch(`/api/cases/${id}/analyze`, { method: "POST" }); const data = await response.json() as MedicalBillCase & { error?: string }; if (!response.ok) throw new Error(data.error || "Bill analysis failed"); setCaseData(data); if (data.status === "REVIEW_REQUIRED") setSelected(data.findings.find((item) => item.action === "REQUEST_REVIEW")?.billItemId ?? null); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Bill analysis failed"); clearInterval(timer); }
      finally { inFlight = false; }
    }, 800);
    return () => clearInterval(timer);
  }, [caseData?.status, id]);

  async function action(path: string, body?: object) {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/cases/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "The action could not be completed"); setCaseData(data); if (path === "run") setSelected(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The action failed"); }
    finally { setBusy(false); }
  }

  async function restartDemo() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/demo/reset", { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "The demo could not restart"); setCaseData(data); setSelected(null); setView("story"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The demo could not restart"); }
    finally { setBusy(false); }
  }

  if (!caseData) return <div className="app-shell"><AppHeader caseId={id}/><main className="case-loading">{error || "Loading the case trail…"}</main></div>;
  const finding = caseData.findings.find((item) => item.billItemId === selected) ?? caseData.findings.find((item) => item.action === "REQUEST_REVIEW") ?? caseData.findings[0];
  const complete = caseData.status === "USER_NOTIFIED";
  return <div className="app-shell"><AppHeader caseId={caseData.id}/><main className="case-page-new">
    <div className="case-toolbar"><Link href="/" className="back-link-new"><ArrowLeft size={15}/> All cases</Link><div className="view-switch" role="group" aria-label="Case view"><button className={view === "story" ? "active" : ""} onClick={() => setView("story")} aria-pressed={view === "story"}>Story</button><button className={view === "system" ? "active" : ""} onClick={() => setView("system")} aria-pressed={view === "system"}>System</button></div></div>
    <section className="case-intro"><div><span className="page-kicker">{caseData.provider.name} / {getStatusCopy(caseData.status)}</span><h1>{complete ? "The question was answered." : caseData.status === "REVIEW_REQUIRED" ? "One question remains." : "Follow the evidence trail."}</h1><p>Payment made {caseData.transaction.date} · {caseData.bill ? `Invoice ${caseData.bill.invoiceId}` : "Statement pending"}</p></div>{caseData.resolution ? <div className="outcome-number"><span>PROVIDER-CONFIRMED CORRECTION</span><strong>{money(caseData.resolution.adjustment)}</strong><small>removed from the bill</small></div> : <div className="outcome-number"><span>ORIGINAL PAYMENT</span><strong>{money(caseData.transaction.amount)}</strong><small>{getStatusCopy(caseData.status)}</small></div>}</section>
    <WorkflowRibbon status={caseData.status}/>
    {error && <div className="action-error" role="alert">{error}</div>}
    {view === "system" ? <SystemView caseData={caseData}/> : <div className="case-workspace-new">
      <aside className="receipt-rail"><ReceiptTrace caseData={caseData} selectedId={finding?.billItemId} onSelect={setSelected} compact/><p><b>How to read this:</b> select a bill line to inspect the exact evidence used in its review.</p></aside>
      <section className="story-panel"><EvidenceWorkspace caseData={caseData} finding={finding}/>
        {caseData.status === "DETECTED" && <div className="decision-panel"><div><span>READY TO TRACE</span><h2>Connect this payment to its bill and records.</h2><p>The synthetic provider will return an itemized statement after a brief delay.</p></div><button className="coral-button" disabled={busy} onClick={() => action("run")}>{busy ? <LoaderCircle className="spin" size={16}/> : null}<span>{busy ? "Building the trail…" : "Start investigation"}</span><ArrowRight size={17}/></button></div>}
        {caseData.status === "WAITING_FOR_BILL" && <div className="decision-panel waiting"><div><span>STATEMENT REQUESTED</span><h2>The paper trail is on its way.</h2><p>The synthetic statement will arrive automatically. This page continues when it is ready.</p></div><LoaderCircle className="spin" size={24}/></div>}
        {caseData.status === "REVIEW_REQUIRED" && <div className="decision-panel attention"><div><span>YOUR AUTHORIZATION</span><h2>Ask hospital billing to verify this line?</h2><p>We’ll request supporting details for this specific charge and add the response to the case. No provider contact happens without this approval.</p></div><button className="coral-button" disabled={busy} onClick={() => action("request-review", { authorized: true })}>{busy ? <LoaderCircle className="spin" size={16}/> : null}<span>{busy ? "Requesting review…" : "Authorize billing review"}</span><ArrowRight size={17}/></button></div>}
        {caseData.resolution && <div className="final-outcome"><span className="page-kicker">PROVIDER-CONFIRMED OUTCOME</span><h2>{money(caseData.resolution.originalTotal)} <i>→</i> {money(caseData.resolution.correctedTotal)}</h2><p>{caseData.resolution.explanation}</p>{caseData.summary && <blockquote>{caseData.summary}</blockquote>}{demo && <button className="reset-demo" onClick={restartDemo} disabled={busy}><RotateCcw size={14}/> Restart demo</button>}</div>}
      </section>
    </div>}
    <footer className="app-footer"><span>Medical Bill Guardian</span><span><Check size={13}/> Synthetic data. Real guardrails.</span></footer>
  </main></div>;
}
