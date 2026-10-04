"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, FileCheck2, HeartPulse, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import type { Finding, MedicalBillCase } from "@/types/domain";
import { PatientTextStatus } from "./PatientTextStatus";
import { CostsAndSources } from "./CostsAndSources";
import { CaseActivity } from "../CaseActivity";
import { InsuranceReview } from "../InsuranceReview";
import { PriceCatalog } from "../PriceCatalog";
import { StatementInbox } from "../StatementInbox";
import { CaseStage } from "./CaseStage";
import { ReviewCall } from "./ReviewCall";
import { RecordsPanel, RecordSourceSummary } from "./RecordsPanel";
import { CallStatusLines, CallingBilling, patientName } from "./CallingBilling";
import { AuthorizeCall } from "./AuthorizeCall";
import { BillScan, ReadingPanel } from "./ReadingPanel";
import { caseViewModel, type ExperienceBeat } from "./view-model";
import { useCaseSession } from "./useCaseSession";

const money = (value: number) => `$${value.toLocaleString()}`;
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function findingLabel(finding: Finding) {
  if (finding.action === "REQUEST_REVIEW") return "Needs explanation";
  if (finding.clinicalStatus === "SUPPORTED") return "Supported by record";
  return "Evidence limited";
}

export function CaseExperience({ id, demo }: { id: string; demo: boolean }) {
  const { caseData, busy, error, action, pollStalled, retryPoll } = useCaseSession(id);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [presentationBeat, setPresentationBeat] = useState<ExperienceBeat | null>(null);

  const view = useMemo(() => caseData ? caseViewModel(caseData) : null, [caseData]);
  useEffect(() => {
    if (!caseData) return;
    const question = caseData.findings.find((finding) => finding.action === "REQUEST_REVIEW");
    setSelected((current) => current && caseData.findings.some((finding) => finding.billItemId === current) ? current : question?.billItemId ?? caseData.findings[0]?.billItemId ?? null);
    if (caseData.resolution) {
      setCallOpen(false);
      setPresentationBeat("outcome");
    } else if (caseData.status === "WAITING_FOR_BILL" && caseData.reading && !caseData.reading.done) {
      // Keep the live reading on screen even after the case advances, until the viewer chooses to continue.
      setPresentationBeat((current) => current ?? "reading");
    } else if (caseData.status === "WAITING_FOR_BILL" && caseData.reading?.failed) {
      // A text that could not be used: drop back to the waiting screen, which shows why.
      setPresentationBeat((current) => current === "reading" ? null : current);
    }
  }, [caseData]);

  async function leave() {
    setLeaving(true); setLeaveError("");
    try {
      const response = await fetch(`/api/cases/${id}/leave`, { method: "POST" });
      if (!response.ok) throw new Error("Could not leave. Please try again.");
      window.speechSynthesis?.cancel();
      window.location.assign("/");
    } catch (cause) {
      setLeaveError(cause instanceof Error ? cause.message : "Could not leave. Please try again.");
      setLeaving(false);
    }
  }
  const exitControl = <div className="gx-exit-control"><button type="button" className="gx-exit" onClick={() => void leave()} disabled={leaving}><ArrowLeft size={16}/>{leaving ? "Leaving…" : "I’m done · Exit"}</button>{leaveError && <span role="alert">{leaveError}</span>}</div>;

  if (!caseData || !view) return <div className="gx-shell"><header className="gx-header"><Link href="/" className="gx-brand"><span><HeartPulse size={18}/></span>Medical Bill Guardian</Link>{exitControl}</header><main className="gx-loading">{error || "Loading the case…"}</main></div>;

  const activeBeat = presentationBeat ?? (callOpen ? "conversation" : view.beat);
  const bill = caseData.bill;
  const selectedFinding = caseData.findings.find((finding) => finding.billItemId === selected) ?? view.questionFinding ?? caseData.findings[0];
  const selectedItem = bill?.items.find((item) => item.id === selectedFinding?.billItemId);
  const selectedRecords = caseData.medicalRecords.filter((record) => selectedFinding?.evidenceRecordIds?.includes(record.id));
  const question = view.questionFinding;
  const stages = [{ id: "bill", label: "Bill" }, { id: "evidence", label: "Evidence" }, { id: "conversation", label: "Review" }, { id: "outcome", label: "Outcome" }] as const;
  const unlocked = (stage: ExperienceBeat) => stage === "bill" || (stage === "evidence" && Boolean(bill)) || (stage === "conversation" && (view.canReview || view.reviewInProgress)) || (stage === "outcome" && view.isComplete);

  async function restart() {
    const response = await fetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: id }) });
    if (response.ok) window.location.assign(`/cases/${(await response.json()).id}`);
  }

  return <div className="gx-shell">
    <header className="gx-header"><Link href="/" className="gx-brand"><span><HeartPulse size={18}/></span>Medical Bill Guardian</Link><div className="gx-header-meta"><span>Demo · fictional patient</span><b>{patientName(caseData)}</b>{exitControl}</div></header>
    <p className="gx-exit-note">Leave whenever you like. Your case is saved; a call already placed can still finish.</p>
    <PatientTextStatus id={id} />
    <nav className="gx-rail" aria-label="Case stages">{stages.map((stage, index) => <button key={stage.id} disabled={!unlocked(stage.id)} className={activeBeat === stage.id ? "active" : ""} onClick={() => { setPresentationBeat(stage.id); document.getElementById("case-workspace")?.scrollIntoView({ behavior: "smooth" }); }}><span>{index + 1}</span>{stage.label}</button>)}</nav>
    <main className="gx-main" id="case-workspace">
      <div className="gx-back-row"><strong>{patientName(caseData)}</strong><span>{caseData.provider.name} · {date(caseData.transaction.date)} · {bill?.invoiceId ?? "statement pending"}</span></div>
      <section className="gx-workspace">
        <div className="gx-copy-panel">
          {activeBeat === "bill" && <div className="gx-beat-copy"><span className="gx-kicker">THE BILL</span><h1>Let’s see what<br/>you paid for.</h1><p>A {money(caseData.transaction.amount)} hospital payment opened this case. With your permission, Guardian will retrieve the statement and compare it with the available records.</p><div className="gx-fact"><span>{caseData.provider.name}</span><strong>{money(caseData.transaction.amount)}</strong><small>Paid {date(caseData.transaction.date)}</small></div>{view.canCollect ? <button className="gx-primary" disabled={busy} onClick={() => void action("run", { authorized: true })}>{busy ? <LoaderCircle className="spin" size={18}/> : <LockKeyhole size={18}/>} {busy ? "Requesting the bill…" : "Authorize bill review"}<ArrowRight size={18}/></button> : <button className="gx-primary" onClick={() => setPresentationBeat(view.beat)}>Continue case <ArrowRight size={18}/></button>}<small className="gx-disclosure">Allows Guardian to retrieve this bill’s records and itemized statement.</small></div>}

          {activeBeat === "collecting" && view.awaitingCallAuth && <AuthorizeCall caseData={caseData} busy={busy} error={error} onAuthorize={() => void action("request-bill", { authorized: true })} />}

          {activeBeat === "collecting" && !view.awaitingCallAuth && <div className="gx-beat-copy"><span className="gx-kicker">CALLING HOSPITAL BILLING</span><h1>Waiting on<br/>the hospital.</h1><p>Guardian matched the payment to a medical encounter and asked billing for the itemized statement. The case continues the moment the hospital texts it.</p>{pollStalled ? <div className="gx-waiting gx-waiting-stalled"><CircleAlert size={20}/><div><strong>Checking for the bill stopped after repeated errors</strong><span>{error || "The statement could not be checked."}</span></div><button className="gx-secondary" onClick={retryPoll}>Check again</button></div> : <CallStatusLines caseData={caseData} />}{caseData.recordSource?.subject && <RecordSourceSummary source={caseData.recordSource} total={caseData.medicalRecords.length} />}{caseData.reading?.failed && <ReadingPanel reading={caseData.reading} />}{demo && view.isWaiting && <StatementInbox id={id} onReceived={() => window.location.reload()} />}</div>}

          {activeBeat === "reading" && caseData.reading && <div className="gx-beat-copy gx-reading-copy"><span className="gx-kicker">THE HOSPITAL TEXTED THE BILL</span><h1>Reading it<br/>line by line.</h1><p>Guardian downloads the PDF, understands it, and checks every charge against the records it retrieved.</p><ReadingPanel reading={caseData.reading} />{caseData.reading.done && (caseData.status === "REVIEW_REQUIRED" || caseData.status === "RESOLVED") && <button className="gx-primary" onClick={() => setPresentationBeat(caseData.status === "RESOLVED" ? "outcome" : "evidence")}>See what Guardian found <ArrowRight size={18}/></button>}</div>}

          {activeBeat === "evidence" && <div className="gx-beat-copy"><span className="gx-kicker">THE EVIDENCE</span><h1>One charge needs<br/>an explanation.</h1><p>{view.supportedCount} charges have supporting clinical records. One charge does not have a matching encounter in the available record.</p>{selectedFinding && <div className="gx-selected-finding"><span>{findingLabel(selectedFinding)}</span><div><h2>{selectedFinding.description}</h2><strong>{money(selectedFinding.amount)}</strong></div><p>{selectedFinding.explanation}</p>{selectedFinding.action === "REQUEST_REVIEW" && <blockquote>{`“Can you show where the ${selectedFinding.description.toLowerCase()} was ordered and performed?”`}</blockquote>}</div>}{view.canReview && <><button className="gx-primary" disabled={busy} onClick={() => { setCallOpen(true); setPresentationBeat("conversation"); }}>Approve billing call <ArrowRight size={18}/></button><small className="gx-disclosure">Authorizes Guardian to ask hospital billing to verify the {question?.description.toLowerCase() ?? "questioned"} charge and request a written correction if appropriate.</small></>}</div>}

          {activeBeat === "conversation" && <div className="gx-beat-copy gx-call-copy"><span className="gx-kicker">AUTHORIZED REVIEW</span><h1>Here is how<br/>we ask.</h1><p>The selected {question ? money(question.amount) : ""} charge and the available evidence stay in view while Guardian asks billing a precise question.</p>{callOpen || view.reviewInProgress ? <ReviewCall caseData={caseData} busy={busy} error={error} onAuthorize={() => void action("request-review", { authorized: true })} onRehearse={async () => { await action("request-review", { authorized: true, rehearsed: true }); }} onCancel={() => { setCallOpen(false); setPresentationBeat("evidence"); }} /> : <button className="gx-primary" onClick={() => setCallOpen(true)}>Open the billing call <ArrowRight size={18}/></button>}</div>}

          {activeBeat === "outcome" && caseData.resolution && <div className="gx-beat-copy"><span className="gx-kicker">WRITTEN CORRECTION</span><h1>{money(caseData.resolution.adjustment)} corrected.<br/>{caseData.financialReview?.status === "REPROCESSING_REQUIRED" ? "Insurance reprocessing required." : caseData.recovery?.status === "REFUND_RECEIVED" ? "Demo refund received." : caseData.recovery?.status === "REFUND_PENDING" ? "Refund pending." : "Charge verified."}</h1><p>{caseData.resolution.explanation}</p><div className="gx-receipt"><div><span>Original payment</span><strong>{money(caseData.resolution.originalTotal)}</strong></div><div><span>Confirmed adjustment</span><strong>−{money(caseData.resolution.adjustment)}</strong></div><div className="total"><span>Corrected charges</span><strong>{money(caseData.resolution.correctedTotal)}</strong></div><small>Confirmation: {caseData.recovery?.confirmation ?? "Recorded in case activity"}</small></div>{caseData.recovery?.status === "REFUND_PENDING" && <button className="gx-credit" disabled={busy} onClick={() => void action("demo-refund")}>{busy ? "Matching credit…" : "Simulate refund credit"}<ArrowRight size={17}/></button>}<p className="gx-ending">A clear answer. A record of what changed.</p></div>}
          {error && !view.awaitingCallAuth && !(activeBeat === "conversation" && callOpen) && <div className="gx-error" role="alert">{error}</div>}
        </div>
        <div className="gx-visual-panel">{activeBeat === "collecting" && !view.awaitingCallAuth ? <CallingBilling caseData={caseData} /> : activeBeat === "reading" && caseData.reading ? <BillScan reading={caseData.reading} /> : <CaseStage caseData={caseData} beat={activeBeat} selectedId={selected}/>}{bill && (activeBeat === "evidence" || activeBeat === "conversation") && <div className="gx-ledger" aria-label="Itemized bill evidence">{bill.items.map((item) => { const finding = caseData.findings.find((entry) => entry.billItemId === item.id); const active = item.id === selected; return <button key={item.id} className={active ? "active" : ""} onClick={() => setSelected(item.id)}><span className={finding?.action === "REQUEST_REVIEW" ? "question" : "supported"}>{finding?.action === "REQUEST_REVIEW" ? <CircleAlert size={14}/> : <CheckCircle2 size={14}/>}</span><span><strong>{item.description}</strong><small>{finding ? findingLabel(finding) : "Awaiting evidence"}</small></span><b>{money(item.amount)}</b></button>; })}</div>}</div>
      </section>

      <CostsAndSources caseData={caseData} />
      <section className="gx-evidence-detail" aria-live="polite">{selectedFinding ? <><div><span className="gx-kicker">SELECTED EVIDENCE</span><h2>{selectedItem?.description ?? selectedFinding.description}</h2><p>{selectedRecords.length ? selectedRecords.map((record) => `${record.description} · ${record.date}`).join(" · ") : "No corresponding service was found in the available records."}</p>{selectedRecords.length > 0 && <div className="gx-source-list">{selectedRecords.map((record) => <span key={record.id}><FileCheck2 size={12}/>{record.type} record · {record.id}</span>)}</div>}</div><div className="gx-detail-verdict"><span>Clinical review · FinchNode / available records</span><strong>{findingLabel(selectedFinding)}</strong><small>Price review: {selectedFinding.pricingStatus === "REVIEW" ? "Review recommended" : selectedFinding.pricingStatus === "ASSESSED" ? "Assessed" : "Not assessed"}</small></div></> : <><div><span className="gx-kicker">CASE STATUS</span><h2>Evidence appears after the statement arrives.</h2></div></>}</section>
      <RecordsPanel caseData={caseData} />
      <button className="gx-details-toggle" onClick={() => setDetailsOpen((open) => !open)}>What did Guardian check? <ChevronDown size={17} className={detailsOpen ? "open" : ""}/></button>
      {detailsOpen && <div className="gx-details">{caseData.reading && <ReadingPanel reading={caseData.reading} compact />}<InsuranceReview caseData={caseData} onUpdated={() => window.location.reload()} /><PriceCatalog codes={[...new Set(caseData.bill?.items.flatMap((item) => item.code ? [item.code] : []) ?? [])]} /><CaseActivity auditLog={caseData.auditLog} communications={caseData.communications}/></div>}
      <footer className="gx-footer"><span><ShieldCheck size={15}/> Missing evidence means “ask,” not “invalid.”</span>{demo && <button onClick={() => void restart()}><RotateCcw size={14}/> Restart this patient</button>}</footer>
    </main>
  </div>;
}
