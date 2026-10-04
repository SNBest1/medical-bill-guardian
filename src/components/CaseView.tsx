import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, RotateCcw } from "lucide-react";
import type { MedicalBillCase } from "../types/domain";
import type { CaseActions } from "../App";
import { AppHeader } from "./AppHeader";
import { EvidenceWorkspace } from "./EvidenceWorkspace";
import { ClaimAndPrices } from "./ClaimAndPrices";
import { ReceiptTrace } from "./ReceiptTrace";
import { SystemView } from "./SystemView";
import { WorkflowRibbon } from "./WorkflowRibbon";
import { getStatusCopy } from "./case-presentation";
import { DEMO_TRANSACTION } from "../../spacetimedb/src/logic/fixtures";

const money = (value: number) => `$${value.toLocaleString()}`;

/** Shows the receipt, evidence, timeline, and approval actions for one live case. */
export function CaseView({ caseData, actions, emailEnabled, onBack }: { caseData: MedicalBillCase; actions: CaseActions; emailEnabled: boolean; onBack: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"story" | "system">("story");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (caseData.status === "REVIEW_REQUIRED" && selected === null) setSelected(caseData.findings.find((item) => item.action === "REQUEST_REVIEW")?.billItemId ?? null); }, [caseData.status, caseData.findings, selected]);

  async function run(task: () => Promise<void>) {
    setBusy(true); setError("");
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The action failed"); }
    finally { setBusy(false); }
  }

  const finding = caseData.findings.find((item) => item.billItemId === selected) ?? caseData.findings.find((item) => item.action === "REQUEST_REVIEW") ?? caseData.findings[0];
  const openFinding = caseData.findings.find((item) => item.action === "REQUEST_REVIEW");
  const complete = caseData.status === "USER_NOTIFIED";
  const billEmail = caseData.communications.find((item) => item.type === "EMAIL_ITEMIZED_BILL_REQUEST");
  const reviewEmail = caseData.communications.find((item) => item.type === "EMAIL_BILLING_REVIEW");
  const isDemo = caseData.transaction.id === DEMO_TRANSACTION.id;
  return <div className="app-shell"><AppHeader caseId={caseData.label} onHome={onBack}/><main className="case-page-new">
    <div className="case-toolbar"><button type="button" onClick={onBack} className="back-link-new"><ArrowLeft size={15}/> All cases</button><div className="view-switch" role="group" aria-label="Case view"><button type="button" className={view === "story" ? "active" : ""} onClick={() => setView("story")} aria-pressed={view === "story"}>Story</button><button type="button" className={view === "system" ? "active" : ""} onClick={() => setView("system")} aria-pressed={view === "system"}>System</button></div></div>
    <section className="case-intro"><div><span className="page-kicker">{caseData.provider.name} / {getStatusCopy(caseData.status)}</span><h1>{complete ? "The question was answered." : caseData.status === "REVIEW_REQUIRED" ? "One question remains." : "Follow the evidence trail."}</h1><p>Payment made {caseData.transaction.date} · {caseData.bill ? `Invoice ${caseData.bill.invoiceId}` : "Statement pending"}</p></div>{caseData.resolution ? <div className="outcome-number"><span>PROVIDER-CONFIRMED CORRECTION</span><strong>{money(caseData.resolution.adjustment)}</strong><small>removed from the bill</small></div> : <div className="outcome-number"><span>ORIGINAL PAYMENT</span><strong>{money(caseData.transaction.amount)}</strong><small>{getStatusCopy(caseData.status)}</small></div>}</section>
    <WorkflowRibbon status={caseData.status}/>
    {error && <div className="action-error" role="alert">{error}</div>}
    {view === "system" ? <SystemView caseData={caseData}/> : <div className="case-workspace-new">
      <aside className="receipt-rail"><ReceiptTrace caseData={caseData} selectedId={finding?.billItemId} onSelect={setSelected} compact/><p><b>How to read this:</b> select a bill line to inspect the evidence used in its review.</p></aside>
      <section className="story-panel"><EvidenceWorkspace caseData={caseData} finding={finding}/>
        <ClaimAndPrices caseData={caseData}/>
        {caseData.status === "DETECTED" && <div className="decision-panel"><div><span>READY TO TRACE</span><h2>Connect this payment to its bill and records.</h2><p>{isDemo ? "Choose the synthetic demo or authorize an email to the configured billing contact for an itemized statement." : "This sandbox payment is separate from the synthetic demo. Request a statement and use only consented records to continue."}</p></div><div className="decision-actions"><button type="button" className="coral-button" disabled={busy || !emailEnabled} onClick={() => run(() => actions.requestBillEmail(caseData.id))}><span>Email billing for statement</span><ArrowRight size={17}/></button>{isDemo && <button type="button" className="sim-button" disabled={busy} onClick={() => run(() => actions.investigate(caseData.id))}>{busy ? <LoaderCircle className="spin" size={16}/> : null}<span>Run synthetic demo</span></button>}{emailEnabled ? <small>Email goes to the configured billing inbox.</small> : <small>Live email is unavailable until the email service is configured.</small>}</div></div>}
        {caseData.status === "WAITING_FOR_BILL" && <div className="decision-panel waiting" role="status"><div><span>STATEMENT REQUESTED</span><h2>The paper trail is on its way.</h2><p>{billEmail ? billEmail.status === "PENDING" ? "The itemized bill request is queued for email delivery." : "The itemized bill request was sent. We’ll continue when the reply arrives." : "The synthetic statement will arrive automatically. This page continues when it is ready."}</p></div><LoaderCircle className="spin" size={24}/></div>}
        {caseData.status === "REVIEW_REQUIRED" && <div className="decision-panel attention"><div><span>YOUR AUTHORIZATION</span><h2>Ask billing to verify {openFinding?.description ?? "this charge"}?</h2><p>{openFinding?.explanation ?? "The available medical record does not verify this line."} To verify it, we can email the configured billing contact for supporting details.</p></div><div className="decision-actions"><button type="button" className="coral-button" disabled={busy || !emailEnabled} onClick={() => run(() => actions.authorizeEmailReview(caseData.id))}><span>Email billing for review</span><ArrowRight size={17}/></button>{isDemo && <button type="button" className="sim-button" disabled={busy} onClick={() => run(() => actions.authorize(caseData.id))}>{busy ? <LoaderCircle className="spin" size={16}/> : null}<span>Simulate email review</span></button>}{emailEnabled ? <small>Email goes to the configured billing inbox.</small> : <small>Live email is unavailable until the email service is configured.</small>}</div></div>}
        {caseData.status === "WAITING_FOR_PROVIDER" && <div className="decision-panel waiting" role="status"><div><span>REVIEW REQUESTED</span><h2>Waiting for billing to reply.</h2><p>{reviewEmail ? reviewEmail.status === "PENDING" ? "Your billing review request is queued for email delivery." : "Your billing review request was sent. We’ll add the provider’s reply to this case." : "The provider review is in progress."}</p></div><LoaderCircle className="spin" size={24}/></div>}
        {caseData.resolution && <div className="final-outcome"><span className="page-kicker">PROVIDER-CONFIRMED OUTCOME</span><h2>{money(caseData.resolution.originalTotal)} <i>→</i> {money(caseData.resolution.correctedTotal)}</h2><p>{caseData.resolution.explanation}</p>{caseData.summary && <blockquote>{caseData.summary}</blockquote>}<button type="button" className="reset-demo" onClick={() => run(actions.restart)} disabled={busy}><RotateCcw size={14}/> Restart demo</button></div>}
        <section className="story-timeline" aria-label="Case timeline"><span className="workspace-kicker">THE STORY SO FAR</span><h2>Case timeline</h2>{caseData.timeline.map((event) => <article key={event.id} className={event.status}><span className="timeline-mark">{event.status === "complete" ? <Check size={13}/> : "?"}</span><div><strong>{event.title}</strong><p>{event.detail}</p><small>{event.source} · {new Date(event.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div></article>)}</section>
      </section>
    </div>}
    <footer className="app-footer"><span>Medical Bill Guardian</span><span><Check size={13}/> Synthetic data. Real guardrails.</span></footer>
  </main></div>;
}
