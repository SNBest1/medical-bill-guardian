import { useEffect, useMemo, useRef, useState } from "react";
import { useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import { reducers, tables } from "./module_bindings";
import { assembleCases } from "./lib/assemble";
import { Dashboard } from "./components/Dashboard";
import { CaseView } from "./components/CaseView";

export type CaseActions = { investigate: (id: string) => Promise<void>; authorize: (id: string) => Promise<void>; requestBillEmail: (id: string) => Promise<void>; authorizeEmailReview: (id: string) => Promise<void>; restart: () => Promise<void> };

/** Subscribes to the caller's views and switches between the dashboard and one case. */
export function App() {
  const { isActive } = useSpacetimeDB();
  const [cases] = useTable(tables.myCases);
  const [records] = useTable(tables.myMedicalRecords);
  const [billItems] = useTable(tables.myBillItems);
  const [findings] = useTable(tables.myFindings);
  const [timeline] = useTable(tables.myTimeline);
  const [audit] = useTable(tables.myAuditLog);
  const [communications] = useTable(tables.myCommunications);
  const [insurance] = useTable(tables.myInsurance);
  const [prices] = useTable(tables.myPriceComparisons);
  const scan = useReducer(reducers.scanDemoPayment);
  const investigate = useReducer(reducers.investigateCase);
  const authorize = useReducer(reducers.authorizeReview);
  const requestBillEmail = useReducer(reducers.requestItemizedBillEmail);
  const authorizeEmailReview = useReducer(reducers.authorizeEmailReview);
  const reset = useReducer(reducers.resetDemo);
  const [openId, setOpenId] = useState<string | null>(null);
  const scanned = useRef(false);

  useEffect(() => { if (isActive && !scanned.current) { scanned.current = true; void scan(); } }, [isActive, scan]);

  const all = useMemo(() => assembleCases({ cases, records, billItems, findings, timeline, audit, communications, insurance, prices }), [cases, records, billItems, findings, timeline, audit, communications, insurance, prices]);
  const actions: CaseActions = {
    investigate: (id) => investigate({ caseId: BigInt(id) }),
    authorize: (id) => authorize({ caseId: BigInt(id) }),
    requestBillEmail: (id) => requestBillEmail({ caseId: BigInt(id) }),
    authorizeEmailReview: (id) => authorizeEmailReview({ caseId: BigInt(id) }),
    restart: async () => { await reset(); await scan(); setOpenId(null); }
  };

  if (!isActive) return <main className="loading-state">Connecting to Medical Bill Guardian…</main>;
  const open = all.find((item) => item.id === openId);
  return open ? <CaseView caseData={open} actions={actions} emailEnabled={import.meta.env.VITE_EMAIL_ENABLED === "true"} onBack={() => setOpenId(null)} /> : <Dashboard cases={all} onOpen={setOpenId} onScan={() => scan()} />;
}
