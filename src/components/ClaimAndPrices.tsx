import type { MedicalBillCase } from "../types/domain";

const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The claim's deduction, each line's published rate, and the dispute letter once authorized. */
export function ClaimAndPrices({ caseData }: { caseData: MedicalBillCase }) {
  const claim = caseData.insurance;
  const priced = caseData.findings.filter((finding) => finding.priceComparison);
  const dispute = caseData.communications.find((item) => item.type === "EMAIL_BILLING_REVIEW" && item.transcript.startsWith("Medical Bill Guardian billing dispute"));
  if (!claim && !priced.length && !dispute) return null;
  return <section className="claim-prices" aria-label="Insurance, published prices, and dispute">
    {claim && <div className="claim-block"><span className="workspace-kicker">INSURANCE CLAIM{claim.synthetic ? " · SYNTHETIC AMOUNTS" : ""}</span>
      <dl>
        <dt>Billed</dt><dd>{money(claim.billed)}</dd>
        <dt>Contract adjustment</dt><dd>−{money(claim.contractual)}</dd>
        <dt>Insurer paid</dt><dd>−{money(claim.insurerPaid)}</dd>
        <dt>You owe per claim</dt><dd><b>{money(claim.patientResponsibility)}</b></dd>
        <dt>You paid</dt><dd>{money(caseData.transaction.amount)}</dd>
        {claim.possibleOverpayment > 0 && <><dt>Possible overpayment</dt><dd><b>{money(claim.possibleOverpayment)}</b></dd></>}
      </dl>
      <p className="claim-note">{claim.payer} · {claim.plan} · claim {claim.claimStatus.toLowerCase()}</p>
    </div>}
    {priced.length > 0 && <div className="claim-block"><span className="workspace-kicker">PUBLISHED PRICES</span>
      <ul>{priced.map((finding) => { const price = finding.priceComparison!; return <li key={finding.billItemId} className={price.review ? "lead" : ""}>
        <span>{finding.description}</span>
        <span>{price.comparedField === "ALLOWED" ? "allowed" : "billed"} {money(price.compared)} vs {price.basis === "NEGOTIATED" ? "contract" : "cash"} {money(price.reference)}{price.review ? ` (${price.multiple}×)` : ""}</span>
        <a href={price.sourceUrl} target="_blank" rel="noreferrer">source</a>
      </li>; })}</ul>
    </div>}
    {dispute && <div className="claim-block"><span className="workspace-kicker">DISPUTE {dispute.status === "PENDING" ? "· SENDING" : "· SENT TO BILLING"}</span><pre>{dispute.transcript}</pre></div>}
  </section>;
}
