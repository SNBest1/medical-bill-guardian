"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, PhoneCall, TriangleAlert } from "lucide-react";
import type { MedicalBillCase } from "../../types/domain";
import { patientName } from "./CallingBilling";
import { ReviewConversation } from "./ReviewConversation";

interface ReviewPlan { live: boolean; ready?: boolean; problems?: string[]; brief?: string[]; destination?: string }

/** Splits "Speaker: text" lines of a call transcript. */
export function transcriptLines(transcript: string): { speaker: "Guardian" | "Billing representative"; text: string }[] {
  return transcript.split("\n").flatMap((line) => {
    const match = /^(Guardian|Billing representative): (.*)$/.exec(line);
    return match ? [{ speaker: match[1] as "Guardian" | "Billing representative", text: match[2] }] : [];
  });
}

/**
 * The review beat. With a dispute agent configured, the patient's approval places a real phone
 * call and this panel shows the call as it happens; otherwise it is the rehearsed conversation.
 */
export function ReviewCall({ caseData, busy, error, onAuthorize, onRehearse, onCancel }: { caseData: MedicalBillCase; busy: boolean; error: string; onAuthorize: () => void; onRehearse: () => Promise<void>; onCancel: () => void }) {
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const calling = caseData.status === "WAITING_FOR_PROVIDER";

  useEffect(() => {
    if (calling) return;
    let cancelled = false;
    fetch(`/api/cases/${caseData.id}/request-review`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("plan")))
      .then((data: ReviewPlan) => { if (!cancelled) setPlan(data); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [caseData.id, calling]);

  if (calling) return <LiveCall caseData={caseData} />;
  if (!plan) return <p className="gx-authcall-muted" role="status">{loadFailed ? "The call plan could not be loaded." : "Loading the call plan…"}</p>;
  if (!plan.live) return <ReviewConversation caseData={caseData} busy={busy} onCancel={onCancel} onSave={onRehearse} />;

  const ready = Boolean(plan.ready);
  return <section className="gx-authcall" aria-labelledby="gx-reviewcall-title">
    <span className="gx-kicker">AUTHORIZE BILLING REVIEW</span>
    <h1 id="gx-reviewcall-title">That click is what<br/>makes the phone ring.</h1>
    <p className="gx-authcall-lede">Guardian will call {caseData.provider.name} billing for {patientName(caseData)} and ask about the one charge the records cannot support. Nothing is sent until you approve.</p>
    <div className="gx-authcall-brief">
      <h2>What the AI will say</h2>
      {plan.brief?.length ? <ul>{plan.brief.map((line) => <li key={line}>{line}</li>)}</ul> : null}
    </div>
    <p className="gx-authcall-warn"><TriangleAlert size={15} aria-hidden="true"/><span><strong>This places a real phone call</strong> to {plan.destination ?? "the demo hospital phone"}: a person plays hospital billing. The outcome is whatever they say on the call, nothing is assumed.</span></p>
    {!ready && <div className="gx-authcall-problem" role="status"><strong>The call cannot be placed yet.</strong><ul>{plan.problems?.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
    <div className="gx-authcall-error" role="alert" aria-live="assertive">{error && <><TriangleAlert size={15} aria-hidden="true"/><span>{error}</span></>}</div>
    <button type="button" className="gx-primary" disabled={busy || !ready} aria-busy={busy} onClick={onAuthorize}>
      {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true"/> : <PhoneCall size={18} aria-hidden="true"/>}
      {busy ? "Placing the call…" : "Authorize billing review call"}
    </button>
    <button type="button" className="gx-secondary" disabled={busy} onClick={() => void onRehearse()}>Use the rehearsed replay instead</button>
    <small className="gx-disclosure">Approving rings {plan.destination ? `the number ${plan.destination}` : "the demo hospital phone"} once. The rehearsed replay is a scripted conversation and rings nothing.</small>
  </section>;
}

/** The call in progress: transcript lines appear as Fish reports them. */
function LiveCall({ caseData }: { caseData: MedicalBillCase }) {
  const call = [...caseData.communications].reverse().find((item) => item.type === "BILLING_REVIEW");
  const lines = transcriptLines(call?.transcript ?? "");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [lines.length]);
  const last = lines[lines.length - 1];
  return <section className="gx-livecall" aria-label="Live billing call">
    <div className="gx-call-bar"><span><i className="gx-live-dot"/> LIVE · Guardian is on the line with hospital billing</span></div>
    <div className="gx-speakers"><span className={last?.speaker === "Guardian" ? "active" : ""}>Guardian</span><i/><span className={last?.speaker === "Billing representative" ? "active" : ""}>Hospital billing</span></div>
    <div className="gx-livecall-lines" aria-live="polite">
      {lines.length === 0 && <p className="gx-authcall-muted"><LoaderCircle className="spin" size={14} aria-hidden="true"/> Ringing… the transcript appears as the call connects.</p>}
      {lines.map((line, index) => <p key={index} className={line.speaker === "Guardian" ? "guardian" : "hospital"}><strong>{line.speaker === "Guardian" ? "Guardian" : "Hospital billing"}</strong>{line.text}</p>)}
      <div ref={end}/>
    </div>
    <small className="gx-disclosure">The outcome is recorded only after the call ends and only from what billing says. A call with no clear answer leaves the bill unchanged.</small>
  </section>;
}
