"use client";

import { useEffect, useState } from "react";
import { Check, Phone } from "lucide-react";
import type { MedicalBillCase } from "../../types/domain";
import { scenarios } from "../../services/scenario-data";

const money = (value: number) => `$${value.toLocaleString()}`;
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

/** Seconds since an ISO timestamp, ticking once a second; null until mounted so server and client markup agree. */
function useElapsed(since?: string): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    const start = since ? Date.parse(since) : Date.now();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return elapsed;
}

/** Patient name for display; the case itself only stores the merchant, so look the synthetic patient up by scenario. */
export function patientName(caseData: MedicalBillCase): string {
  const scenario = scenarios.find((entry) => entry.id === caseData.scenarioId);
  return scenario ? `${scenario.patient.firstName} ${scenario.patient.lastName}` : "Demo Patient";
}

/** Left-hand status lines for the waiting beat. */
const isFishCall = (caseData: MedicalBillCase) => Boolean(caseData.communications.find((item) => item.type === "ITEMIZED_BILL_REQUEST")?.result?.startsWith("Fish call queued"));

export function CallStatusLines({ caseData }: { caseData: MedicalBillCase }) {
  const lines = [
    { done: true, text: caseData.recordSource ? "Records retrieved (FinchNode record format, synthetic)" : "Medical records retrieved" },
    { done: true, text: isFishCall(caseData) ? `Called ${caseData.provider.name} billing and asked for the itemized bill` : `Itemized bill requested from ${caseData.provider.name} billing` },
    { done: false, text: "Waiting for the hospital to text the itemized bill" }
  ];
  return <ul className="gx-call-lines" aria-label="Where the case stands">{lines.map((line) => <li key={line.text} className={line.done ? "done" : "now"}><span>{line.done ? <Check size={13}/> : <i/>}</span>{line.text}</li>)}</ul>;
}

/** Animated "on the phone" card for WAITING_FOR_BILL. Motion is CSS-only and disabled by prefers-reduced-motion. */
export function CallingBilling({ caseData }: { caseData: MedicalBillCase }) {
  const request = caseData.communications.find((item) => item.type === "ITEMIZED_BILL_REQUEST");
  const elapsed = useElapsed(request?.timestamp);
  return <div className="gx-call" role="status" aria-live="polite">
    <div className="gx-call-top"><span className="gx-call-live"><i/>CALLING HOSPITAL BILLING</span><time aria-label="Time on the call">{elapsed === null ? "--:--" : clock(elapsed)}</time></div>
    <div className="gx-call-orb" aria-hidden="true"><span className="r1"/><span className="r2"/><span className="r3"/><div><Phone size={30}/></div></div>
    <div className="gx-call-who"><strong>{caseData.provider.name}</strong><span>Patient Billing Office</span></div>
    <div className="gx-wave" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 0.11}s` }}/>)}</div>
    <p className="gx-call-line">Guardian is on the phone with {caseData.provider.name} billing - waiting for them to text the itemized bill</p>
    <div className="gx-call-wait"><span className="gx-dots" aria-hidden="true"><i/><i/><i/></span>Waiting for the hospital&apos;s text</div>
    <dl className="gx-call-ctx"><div><dt>Patient</dt><dd>{patientName(caseData)}</dd></div><div><dt>Paid</dt><dd>{money(caseData.transaction.amount)}</dd></div><div><dt>Invoice</dt><dd>{caseData.bill?.invoiceId ?? "arrives with the bill"}</dd></div></dl>
    <p className="gx-call-note">{isFishCall(caseData) ? "Live demo call: Guardian's AI phoned a person who plays hospital billing, using fictional data only." : "Staged demo call: a person plays hospital billing. Guardian does not place the call itself."}</p>
  </div>;
}
