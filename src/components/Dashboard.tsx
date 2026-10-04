"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleHelp, LoaderCircle } from "lucide-react";
import type { MedicalBillCase } from "@/types/domain";
import { AppHeader } from "./AppHeader";
import { ReceiptTrace } from "./ReceiptTrace";
import { WorkflowRibbon } from "./WorkflowRibbon";
import { getStatusCopy } from "./case-presentation";

const money = (value: number) => `$${value.toLocaleString()}`;

export function Dashboard({ demo }: { demo: boolean }) {
  const [cases, setCases] = useState<MedicalBillCase[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { const response = await fetch("/api/cases"); if (response.ok) setCases(await response.json()); }, []);
  useEffect(() => { if (demo) void scan(); else void refresh(); }, [demo, refresh]);

  async function scan() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/transactions/scan", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Transaction scan failed");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scan failed"); }
    finally { setBusy(false); }
  }

  const featured = cases[0];
  const reviewFinding = featured?.findings.find((finding) => finding.action === "REQUEST_REVIEW");
  const completed = featured?.status === "USER_NOTIFIED";
  return <div className="app-shell">
    <AppHeader caseId={featured?.id}/>
    <main className="landing-page">
      {featured ? <>
        <section className="demo-stage">
          <div className="landing-copy"><span className="page-kicker">A SECOND LOOK, LINE BY LINE</span><h1>Your hospital bill has a <em>paper trail.</em><br/>Follow it.</h1><p>We connect the payment, the itemized statement, and the medical record—then show exactly where the story stops adding up.</p><Link href={`/cases/${featured.id}`} className="ink-button"><span>{completed ? "Review the outcome" : featured.status === "DETECTED" ? "Trace this payment" : "Open investigation"}</span><ArrowRight size={18}/></Link>{error && <p className="inline-error" role="alert">{error}</p>}<div className="architecture-line"><span>Bank signal</span><b>→</b><span>Consented records</span><b>→</b><span>Deterministic reconciliation</span><b>→</b><span>Authorized outreach</span></div></div>
          <div className="landing-receipt"><ReceiptTrace caseData={featured}/></div>
          <aside className="landing-evidence">
            <div className="evidence-thread"><span>CONNECTED EVIDENCE</span><h2>{featured.medicalRecords.length ? `${featured.medicalRecords.length} records retrieved` : "Payment detected"}</h2><p>{featured.medicalRecords.length ? "Clinical records are matched only when the provider and service window align." : "The $4,820 University Hospital payment opened this case."}</p></div>
            <div className={`evidence-thread ${reviewFinding ? "attention" : ""}`}><span>{reviewFinding ? "ONE OPEN QUESTION" : completed ? "PROVIDER CONFIRMED" : "NEXT STEP"}</span><h2>{reviewFinding ? reviewFinding.description : completed ? `${money(featured.resolution?.adjustment ?? 0)} removed` : getStatusCopy(featured.status)}</h2><p>{reviewFinding ? "No matching specialist encounter appears in the available record." : completed ? "The hospital confirmed the questioned line duplicated services already included in the ER charge." : "Open the case to watch the evidence trail build."}</p>{reviewFinding && <span className="thread-action">Your authorization is required →</span>}</div>
          </aside>
        </section>
        <WorkflowRibbon status={featured.status}/>
      </> : <section className="empty-landing"><span className="page-kicker">SYNTHETIC DEMONSTRATION</span><h1>Start with the payment.<br/><em>End with an answer.</em></h1><p>Scan the synthetic account to open the University Hospital case and trace every charge to its evidence.</p><button className="ink-button" onClick={scan} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <CircleHelp size={17}/>}<span>{busy ? "Scanning synthetic account…" : "Scan synthetic account"}</span><ArrowRight size={18}/></button>{error && <p className="inline-error" role="alert">{error}</p>}</section>}

      <section className="case-archive"><div className="archive-heading"><div><span className="page-kicker">CASE ARCHIVE</span><h2>Every investigation, accounted for.</h2></div><span>{cases.length.toString().padStart(2, "0")} CASES</span></div>{cases.length ? <div className="archive-list">{cases.map((item) => <Link href={`/cases/${item.id}`} key={item.id} className="archive-row"><span className="archive-index">{item.id.slice(-2)}</span><span><strong>{item.provider.name}</strong><small>{item.transaction.date} · {item.id}</small></span><b>{money(item.transaction.amount)}</b><span className={`archive-status ${item.status === "REVIEW_REQUIRED" ? "attention" : item.status === "USER_NOTIFIED" ? "complete" : ""}`}>{getStatusCopy(item.status)}</span><ArrowRight size={17}/></Link>)}</div> : <div className="archive-empty"><p>No cases yet. A synthetic scan creates one idempotent investigation.</p></div>}</section>
      <footer className="app-footer"><span>Medical Bill Guardian</span><span><Check size={13}/> Missing evidence starts a question. Provider confirmation ends it.</span></footer>
    </main>
  </div>;
}
