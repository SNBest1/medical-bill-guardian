import { Check, CircleHelp, ShieldCheck } from "lucide-react";
import type { Finding, MedicalBillCase } from "@/types/domain";

const money = (value: number) => `$${value.toLocaleString()}`;

export function EvidenceWorkspace({ caseData, finding }: { caseData: MedicalBillCase; finding?: Finding }) {
  if (!caseData.bill || !finding) return <div className="evidence-empty"><ShieldCheck size={30}/><h2>The evidence trail starts here.</h2><p>Run the investigation to retrieve the statement and match each charge to the available record.</p></div>;
  const uncertain = finding.action === "REQUEST_REVIEW";
  const resolved = uncertain && Boolean(caseData.resolution);
  return <div className="evidence-workspace">
    <span className={`workspace-kicker ${uncertain && !resolved ? "attention" : ""}`}>CHARGE EVIDENCE / {resolved ? "PROVIDER CONFIRMED" : uncertain ? "NEEDS VERIFICATION" : "SUPPORTED"}</span>
    <h2>{finding.description} <em>· {money(finding.amount)}</em></h2>
    <p className="workspace-lede">{finding.explanation}</p>
    <div className="evidence-compare">
      <article><span>THE BILL SAYS</span><strong>{finding.description}</strong><p>One service billed by {caseData.provider.name} on {caseData.transaction.date}.</p></article>
      <article className={uncertain ? "missing" : "matched"}><span>THE RECORD SHOWS</span><strong>{finding.evidence.length ? `${finding.evidence.length} matching ${finding.evidence.length === 1 ? "record" : "records"}` : "No corresponding encounter"}</strong>{finding.evidence.length ? finding.evidence.map((item) => <p className="record-match" key={item}><Check size={14}/>{item}</p>) : <p>Available records contain no matching evidence for this line.</p>}</article>
    </div>
    <div className={`interpretation ${uncertain && !resolved ? "attention" : ""}`}><span>{uncertain && !resolved ? <CircleHelp size={18}/> : <ShieldCheck size={18}/>}</span><div><strong>{resolved ? "Provider-confirmed result" : "What this means"}</strong><p>{resolved ? caseData.resolution?.explanation : uncertain ? "Missing evidence is a reason to ask a question—not enough to call the charge incorrect." : "The available clinical record supports this billed service."}</p></div></div>
    <div className="confidence"><div><span>Clinical match confidence</span><strong>{Math.round(finding.confidence * 100)}%</strong></div><i><b style={{ width: `${finding.confidence * 100}%` }}/></i></div>
    <div className="price-boundary"><strong>Financial review: {finding.pricingStatus === "REVIEW" ? "Review recommended" : "Not assessed"}</strong><span>No trusted price reference is connected, so this demo makes no market-price claim.</span></div>
  </div>;
}
