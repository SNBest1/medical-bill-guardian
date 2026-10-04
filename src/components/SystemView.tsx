import type { MedicalBillCase } from "../types/domain";

const time = (value: string) => new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function SystemView({ caseData }: { caseData: MedicalBillCase }) {
  const emailWorkflow = caseData.communications.some((item) => item.type.startsWith("EMAIL_"));
  return <div className="system-view">
    <div className="system-intro"><div><span className="workspace-kicker">SYSTEM VIEW / RECORDED FACTS</span><h2>See the machinery behind the case.</h2><p>{emailWorkflow ? "This case uses synthetic payment and medical data. You authorized an email to the configured billing contact; delivery and replies appear below." : "This demo uses synthetic data and mock providers. Live bank and medical data require an authorized account and consent; provider email requires your approval."}</p></div><span className="system-badge">{emailWorkflow ? <>EMAIL WORKFLOW<br/>SYNTHETIC DATA</> : <>MOCK PROVIDERS<br/>SYNTHETIC DATA</>}</span></div>
    <div className="architecture-flow"><span>Bank signal<small>Provider boundary</small></span><b>→</b><span>Medical records<small>Consented evidence</small></span><b>→</b><span>Reconciliation<small>Deterministic rules</small></span><b>→</b><span>Provider outreach<small>Only after approval</small></span></div>
    <div className="system-grid"><section><header><span>AGENT ACTIVITY</span><b>{caseData.auditLog.length} steps</b></header>{caseData.auditLog.map((entry) => <article key={entry.id}><div><strong>{entry.action.replaceAll("_", " ")}</strong><time>{time(entry.timestamp)}</time></div><code>{entry.tool}</code><p>{entry.outputSummary}</p></article>)}</section><section><header><span>COMMUNICATIONS</span><b>{caseData.communications.length} records</b></header>{caseData.communications.length ? caseData.communications.map((item) => <article key={item.id}><div><strong>{item.type.replaceAll("_", " ")}</strong><time>{time(item.timestamp)}</time></div><code>{item.status}</code><p>{item.transcript}</p>{item.result && <p className="system-result">Outcome: {item.result}</p>}</article>) : <div className="system-empty">No communication has been recorded yet.</div>}</section></div>
  </div>;
}
