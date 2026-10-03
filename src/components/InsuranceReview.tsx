"use client";
import { useState } from "react";
import type { MedicalBillCase } from "@/types/domain";

export function InsuranceReview({ caseData, onUpdated }: { caseData: MedicalBillCase; onUpdated: (data: MedicalBillCase) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bill = caseData.bill!;
  const review = caseData.financialReview;
  function loadExample() {
    setInput(JSON.stringify({ coverage: "INSURED", network: "IN_NETWORK", claimStatus: "FINAL", payer: "Fictional demo insurer", plan: "Fictional demo plan", eob: { invoiceId: bill.invoiceId, serviceDate: bill.items[0].serviceDate, billedTotal: bill.total, allowedTotal: 3000, contractualAdjustment: bill.total - 3000, insurerPaid: 2400, otherPayerPaid: 0, deductible: 400, copay: 0, coinsurance: 200, noncovered: 0, patientResponsibility: 600 } }, null, 2));
  }
  async function submit() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/cases/${caseData.id}/insurance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: input });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Insurance review failed");
      onUpdated(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Insurance review failed"); }
    finally { setBusy(false); }
  }
  return <section className="recovery-panel"><span className="section-kicker">INSURANCE & PATIENT RESPONSIBILITY</span><h2>{review?.status.replaceAll("_", " ").toLowerCase() ?? "Needs insurance information"}</h2><p>Gross charges, a negotiated rate, and the patient's balance are different amounts. Use the matching final EOB before estimating what the patient owes.</p>{review?.expectedPatientResponsibility !== undefined && <p><strong>EOB/statement patient responsibility: ${review.expectedPatientResponsibility.toLocaleString()}</strong></p>}{review?.possibleExcessPayment !== undefined && review.possibleExcessPayment > 0 && <p>Payment exceeds that balance by ${review.possibleExcessPayment.toLocaleString()}. Verify payment allocation and request a correction; this is not a confirmed refund.</p>}<ul>{review?.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{!caseData.resolution && <details className="statement-inbox"><summary>Add synthetic insurance / EOB data</summary><p>The example is fictional and makes no claim about either demo participant's actual insurance.</p><label htmlFor="insurance-input">Insurance and final EOB JSON</label><textarea id="insurance-input" value={input} maxLength={65536} onChange={(event) => setInput(event.target.value)} rows={12} /><div className="voice-controls"><button className="secondary-button" onClick={loadExample}>Load fictional insured example</button><button className="primary-button" disabled={busy || !input} onClick={submit}>{busy ? "Reviewing…" : "Review patient balance"}</button></div>{error && <p role="alert" className="error-text">{error}</p>}</details>}</section>;
}
