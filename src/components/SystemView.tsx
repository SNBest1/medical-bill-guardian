import type { MedicalBillCase } from "@/types/domain";

const time = (value: string) => new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function SystemView({ caseData }: { caseData: MedicalBillCase }) {
  const usesFishDemo = caseData.communications.some((item) => item.result?.includes("Fish call queued"));
  const communicationBoundary = usesFishDemo ? "Fish Audio outbound call + synthetic statement fixture" : "Mock provider";
  return <div className="system-view">
    <div className="system-intro"><div><span className="workspace-kicker">SYSTEM VIEW / RECORDED FACTS</span><h2>See the machinery behind the case.</h2><p>{usesFishDemo ? "This run used Fish Audio for the authorized outbound demo call. The itemized statement remains a synthetic fixture and was not collected by that call." : "This run uses synthetic data and mock providers. The same boundaries can accept Nessie bank data, consented FinchNode records, and a future Relay or Photon communication adapter."}</p></div><span className="system-badge">{usesFishDemo ? <>FISH AUDIO CALL<br/>SYNTHETIC STATEMENT</> : <>MOCK PROVIDERS<br/>SYNTHETIC DATA</>}</span></div>
    <div className="architecture-flow"><span>Bank signal<small>Provider boundary</small></span><b>→</b><span>Medical records<small>Consented evidence</small></span><b>→</b><span>Reconciliation<small>Deterministic rules</small></span><b>→</b><span>Provider outreach<small>{communicationBoundary}</small></span></div>
    <div className="system-grid"><section><header><span>AGENT ACTIVITY</span><b>{caseData.auditLog.length} steps</b></header>{caseData.auditLog.map((entry) => <article key={entry.id}><div><strong>{entry.action.replaceAll("_", " ")}</strong><time>{time(entry.timestamp)}</time></div><code>{entry.tool}</code><p>{entry.outputSummary}</p></article>)}</section><section><header><span>COMMUNICATIONS</span><b>{caseData.communications.length} records</b></header>{caseData.communications.length ? caseData.communications.map((item) => <article key={item.id}><div><strong>{item.type.replaceAll("_", " ")}</strong><time>{time(item.timestamp)}</time></div><code>{item.status}</code><p>{item.transcript}</p>{item.result && <p className="system-result">Outcome: {item.result}</p>}</article>) : <div className="system-empty">No communication has been recorded yet.</div>}</section></div>
  </div>;
}
