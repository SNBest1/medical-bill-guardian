import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MedicalBillCase } from "../types/domain";
import { Dashboard } from "./Dashboard";

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
