"use client";
import { useState } from "react";

type Catalog = { sourceName: string; sourcePage: string; limitations: string[]; metadata: { hospital_name: string; last_updated_on: string }; totalMatches: number; records: { amount: number; setting: string; component: string; payer: string | null; plan: string | null; methodology: string }[] };
export function PriceCatalog() {
  const [code, setCode] = useState("99285");
  const [basis, setBasis] = useState("CASH");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/pricing/reference?code=${encodeURIComponent(code)}&basis=${basis}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read the reference catalog");
      setCatalog(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the reference catalog"); }
    finally { setBusy(false); }
  }
  return <details className="statement-inbox"><summary>Published price reference database</summary><p>This is University of Michigan Health's actual published snapshot, separate from the fictional University Hospital demo. Rates are not automatically used as patient responsibility or guaranteed refund amounts.</p><div className="voice-controls"><label>Procedure code <select value={code} onChange={(event) => { setCode(event.target.value); setCatalog(null); }}>{["99285", "70450", "71046", "12001"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Rate basis <select value={basis} onChange={(event) => { setBasis(event.target.value); setCatalog(null); }}><option value="CASH">Discounted cash</option><option value="NEGOTIATED">Payer-specific negotiated</option></select></label><button className="secondary-button" disabled={busy} onClick={search}>{busy ? "Loading…" : "Look up published rates"}</button></div>{error && <p className="error-text" role="alert">{error}</p>}{catalog && <><p><a href={catalog.sourcePage} target="_blank" rel="noopener noreferrer">{catalog.sourceName}</a> · snapshot {catalog.metadata.last_updated_on} · {catalog.totalMatches} matching records; showing up to 50</p><div style={{ overflowX: "auto" }}><table><thead><tr><th>Published amount</th><th>Setting / component</th><th>Payer / plan</th><th>Methodology</th></tr></thead><tbody>{catalog.records.map((rate, index) => <tr key={index}><td>${rate.amount.toLocaleString()}</td><td>{rate.setting.toLowerCase()} / {rate.component.toLowerCase()}</td><td>{rate.payer ?? "Cash"}<br />{rate.plan}</td><td>{rate.methodology || "See publisher notes"}</td></tr>)}</tbody></table></div><ul>{catalog.limitations.map((item) => <li key={item}>{item}</li>)}</ul></>}</details>;
}
