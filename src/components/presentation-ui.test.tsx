import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MedicalBillCase } from "../types/domain";
import { Dashboard } from "./Dashboard";
import { CaseView } from "./CaseView";

it("shows the case's actual provider and payment instead of demo constants", () => {
  const caseData: MedicalBillCase = {
    id: "7", label: "CASE-7", status: "DETECTED",
    transaction: { id: "txn-7", merchant: "Harbor Clinic", amount: 1234, date: "2026-10-03" },
    provider: { name: "Harbor Clinic" }, medicalRecords: [], bill: null, findings: [], communications: [], timeline: [], auditLog: [], resolution: null, summary: null, createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z"
  };
  const html = renderToStaticMarkup(<Dashboard cases={[caseData]} onOpen={() => {}} onScan={async () => {}}/>);
  expect(html).toContain("Harbor Clinic");
  expect(html).toContain("$1,234");
  expect(html).not.toContain("University Hospital");
  expect(html).not.toContain("$4,820");
});

it("does not offer mock clinical evidence for a sandbox purchase", () => {
  const caseData: MedicalBillCase = {
    id: "8", label: "Harbor Clinic", status: "DETECTED",
    transaction: { id: "sandbox-purchase-8", merchant: "Harbor Clinic", amount: 1234, date: "2026-10-03" },
    provider: { name: "Harbor Clinic" }, medicalRecords: [], bill: null, findings: [], communications: [], timeline: [], auditLog: [], resolution: null, summary: null, createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z"
  };
  const noop = async () => {};
  const html = renderToStaticMarkup(<CaseView caseData={caseData} actions={{ investigate: noop, authorize: noop, requestBillEmail: noop, authorizeEmailReview: noop, restart: noop }} emailEnabled={false} onBack={() => {}}/>);
  expect(html).toContain("This sandbox payment is separate from the synthetic demo");
  expect(html).toContain("No clinical match is claimed without consented records");
  expect(html).not.toContain("Run synthetic demo");
});
