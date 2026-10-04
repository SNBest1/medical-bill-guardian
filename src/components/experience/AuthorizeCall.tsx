"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, PhoneCall, TriangleAlert } from "lucide-react";
import type { MedicalBillCase } from "../../types/domain";
import { patientName } from "./CallingBilling";

const money = (value: number) => `$${value.toLocaleString()}`;

interface CallPlan { fish: boolean; ready?: boolean; problems?: string[]; brief?: string[]; destination?: string; guardianLine?: string }

/**
 * Authorization checkpoint shown when the case is paused at REQUESTING_BILL: a real phone call
 * will ring a real phone, so nothing happens until the user presses the button. The call plan
 * is built on the server and arrives with masked numbers only.
 */
export function AuthorizeCall({ caseData, busy, error, onAuthorize }: { caseData: MedicalBillCase; busy: boolean; error: string; onAuthorize: () => void }) {
  const [plan, setPlan] = useState<CallPlan | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cases/${caseData.id}/request-bill`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("plan")))
      .then((data: CallPlan) => { if (!cancelled) setPlan(data); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [caseData.id]);

  const ready = Boolean(plan?.fish && plan.ready);
  return <section className="gx-authcall" aria-labelledby="gx-authcall-title">
    <span className="gx-kicker">AUTHORIZE HOSPITAL CALL</span>
    <h1 id="gx-authcall-title">Ready to call<br/>hospital billing.</h1>
    <p className="gx-authcall-lede">The records are in. Guardian will phone {caseData.provider.name} billing to ask for the itemized bill. Nothing is sent until you approve.</p>
    <dl className="gx-authcall-facts">
      <div><dt>Patient</dt><dd>{patientName(caseData)}</dd></div>
      <div><dt>Hospital</dt><dd>{caseData.provider.name}</dd></div>
      <div><dt>Paid</dt><dd>{money(caseData.transaction.amount)}</dd></div>
      <div><dt>Calls</dt><dd>{plan?.destination ?? "…"}</dd></div>
      <div><dt>Bill texted to</dt><dd>{plan?.guardianLine ?? "…"}</dd></div>
    </dl>
    <div className="gx-authcall-brief">
      <h2>What the AI will say</h2>
      {plan?.brief?.length ? <ul>{plan.brief.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="gx-authcall-muted">{loadFailed ? "The call plan could not be loaded." : "Loading the call plan…"}</p>}
    </div>
    <p className="gx-authcall-warn"><TriangleAlert size={15} aria-hidden="true"/><span><strong>This places a real phone call</strong> to a real phone: a person plays hospital billing. The call uses fictional data only.</span></p>
    {plan && !plan.fish && <p className="gx-authcall-problem" role="status">Phone calls are not configured on this server, so this case cannot call out.</p>}
    {plan?.fish && !plan.ready && <div className="gx-authcall-problem" role="status"><strong>The call cannot be placed yet.</strong><ul>{plan.problems?.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
    <div className="gx-authcall-error" role="alert" aria-live="assertive">{error && <><TriangleAlert size={15} aria-hidden="true"/><span>{error}</span></>}</div>
    <button type="button" className="gx-primary" disabled={busy || !ready} aria-busy={busy} onClick={onAuthorize}>
      {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true"/> : <PhoneCall size={18} aria-hidden="true"/>}
      {busy ? "Calling hospital…" : "Authorize hospital call"}
    </button>
    <small className="gx-disclosure">Approving rings {plan?.destination ? `the number ${plan.destination}` : "the demo hospital phone"} once. Pressing again will not place a second call.</small>
  </section>;
}
