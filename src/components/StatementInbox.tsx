"use client";

import { useState } from "react";
import type { MedicalBillCase } from "@/types/domain";
import { demoStatement } from "@/services/demo";

export function StatementInbox({ id, onReceived }: { id: string; onReceived: (data: MedicalBillCase) => void }) {
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/cases/${id}/statement`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: statement });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Statement could not be received");
      onReceived(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Statement could not be received"); }
    finally { setBusy(false); }
  }
  return <details className="statement-inbox"><summary>Demo statement inbox · text fallback</summary><p>Use fictional data only. The automatic demo statement may arrive first. External messaging is not connected yet.</p><label htmlFor="statement">Itemized statement</label><textarea id="statement" maxLength={65536} value={statement} onChange={(event) => setStatement(event.target.value)} rows={10} placeholder="Paste the synthetic provider statement" /><div className="voice-controls"><button className="secondary-button" onClick={() => setStatement(demoStatement)}>Load exact demo statement</button><button className="primary-button" disabled={busy || !statement.trim()} onClick={submit}>{busy ? "Receiving…" : "Receive & analyze statement"}</button></div>{error && <p role="alert" className="error-text">{error}</p>}</details>;
}
