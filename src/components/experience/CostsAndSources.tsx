"use client";
import { useEffect, useState } from "react";
import type { MedicalBillCase } from "@/types/domain";
import type { costView } from "@/services/reconciliation/cost-view";
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function CostsAndSources({ caseData: c }: { caseData: MedicalBillCase }) {
  const [rows, setRows] = useState<ReturnType<typeof costView>>([]);
  const [paymentSource, setPaymentSource] = useState("Loading bank source…");
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/api/cases/${c.id}/costs`, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error("costs");
      const data = await r.json();
      if (!cancelled) { setRows(data.rows); setPaymentSource(data.paymentSource); setError(false); setLoaded(true); }
    }).catch(() => { if (!cancelled) { setError(true); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [c.id, c.updatedAt]);
  const pdf = c.auditLog.some((a) => a.tool === "receiveBillPdf");
  const billSource = pdf ? "Hospital PDF · received through Photon" : c.auditLog.some((a) => a.action === "PHOTON_STATEMENT") ? "Hospital text · received through Photon" : c.bill ? "Synthetic demo statement" : "Hospital statement · not received yet";
  const recordsSource = c.recordSource?.tier === "sandbox" ? "FinchNode · consented synthetic sandbox patient" : c.recordSource?.tier === "open-demo" ? "FinchNode · public synthetic API" : c.recordSource?.tier === "saved-copy" ? "FinchNode · saved copy (offline fallback)" : "Local synthetic medical-record fixture";
  return <section className="gx-costs" aria-labelledby="cost-title">
    <span className="gx-kicker">WHERE THE INFORMATION COMES FROM</span>
    <div className="gx-source-strip">
      <div><small>Payment · {paymentSource}</small><strong>{money(c.transaction.amount)} paid</strong></div>
      <div><small>Medical evidence</small><strong>{c.medicalRecords.length ? recordsSource : "Not retrieved yet"}</strong></div>
      <div><small>Charges · {billSource}</small><strong>{c.bill ? `${money(c.bill.total)} billed · ${c.bill.invoiceId}` : "Waiting for the bill"}</strong></div>
    </div>
    <h2 id="cost-title">What was charged vs. what it should cost</h2>
    <p>A verified comparable cash or contract rate is shown as the expected price. CMS and Michigan Medicine figures are named benchmarks; they do not establish this patient's owed amount.</p>
    {!c.bill ? <p>The comparison appears when the itemized statement arrives.</p> : error ? <p role="alert">Price sources could not be loaded. Retrying as the case updates.</p> : !loaded ? <p role="status">Loading price sources…</p> : <div className="gx-cost-table"><table><thead><tr><th>Service</th><th>Charged</th><th>Expected price</th><th>Published benchmark</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><strong>{row.description}</strong><small>Code {row.code ?? "not supplied"}</small></td>
      <td><strong>{money(row.charged)}</strong><small>{billSource}<br/>Fictional demo charges</small></td>
      <td>{row.expected !== null && row.expectedSource ? <><strong>{money(row.expected)}</strong><small><a href={row.expectedSource.url} target="_blank" rel="noreferrer">{row.expectedSource.name}</a> · {row.expectedSource.basis} · {row.expectedSource.asOf}<br/>{money(row.difference!)} difference from billed amount</small></> : <><strong>Not established</strong><small>{row.missing.join(" · ")}</small></>}</td>
      <td>{row.benchmark ? <><strong>{money(row.benchmark.amount)} / {row.benchmark.unit}</strong><small><a href={row.benchmark.url} target="_blank" rel="noreferrer">{row.benchmark.name}</a><br/>{row.benchmark.validFrom}–{row.benchmark.validThrough}<br/>Medicare lab-payment benchmark</small></> : row.michigan ? <><strong>{money(row.michigan.low)}–{money(row.michigan.high)}</strong><small><a href={row.michigan.url} target="_blank" rel="noreferrer">Michigan Medicine dataset</a> · {row.michigan.asOf}<br/>Other hospital's cash-rate range; setting and component vary</small></> : <><strong>No matching benchmark</strong><small>No applicable CMS lab rate or matching code in the Michigan Medicine dataset.</small></>}</td>
    </tr>)}</tbody></table></div>}
    {c.financialReview?.expectedPatientResponsibility !== undefined && <p><strong>Patient balance: {money(c.financialReview.expectedPatientResponsibility)}</strong> · Source: {c.insurance?.eob ? "Entered insurer EOB · synthetic demo input" : "Hospital statement"}. This is separate from each service's gross price.</p>}
    {c.resolution && <p>Review outcome source: {c.communications.some((a) => a.type === "BILLING_REVIEW" && a.live) ? "Hospital stand-in's Fish Audio call transcript" : "Scripted demo billing response"}. {c.resolution.explanation}</p>}
  </section>;
}
