import type { AuditEntry, Communication } from "../types/domain";

/** Lets demo viewers inspect recorded tool steps and provider exchanges. */
export function CaseActivity({ auditLog, communications }: { auditLog: AuditEntry[]; communications: Communication[] }) {
  return <section className="activity-panel">
    <span className="section-kicker">BEHIND THE CASE</span>
    <h2>Activity and communications</h2>
    <p>Open a section to see what the case agent did and what the mock provider returned.</p>
    <details><summary>Agent activity <span>{auditLog.length} steps</span></summary><div className="activity-list">{auditLog.map((entry) => <div className="activity-row" key={entry.id}><div><strong>{entry.action.replaceAll("_", " ")}</strong><small>{entry.tool} · {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small></div><p>{entry.outputSummary}</p></div>)}</div></details>
    <details><summary>Provider and user messages <span>{communications.length} {communications.length === 1 ? "record" : "records"}</span></summary><div className="activity-list">{communications.map((item) => <div className="activity-row" key={item.id}><div><strong>{item.type.replaceAll("_", " ")}</strong><small>{item.status} · {new Date(item.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small></div><p>{item.transcript}</p>{item.result && <p><b>Outcome:</b> {item.result}</p>}</div>)}</div></details>
  </section>;
}
