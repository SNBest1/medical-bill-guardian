import { describe, expect, it } from "vitest";
import { Identity, Timestamp } from "spacetimedb";
import { assembleCases, type ViewRows } from "./assemble";

const owner = Identity.zero();
const at = (micros: bigint) => new Timestamp(micros);

const rows: ViewRows = {
  cases: [{ id: 7n, owner, label: "CASE-4821", status: "USER_NOTIFIED", transactionId: "nessie-demo-4820", merchant: "University Hospital", amountCents: 482000n, paidOn: "2026-09-28", invoiceId: "UH-48291", billTotalCents: 482000n, resolution: { result: "DUPLICATE_REMOVED", originalTotalCents: 482000n, correctedTotalCents: 412000n, adjustmentCents: 70000n, explanation: "Removed." }, summary: "Done.", createdAt: at(1n), updatedAt: at(9n) }],
  records: [],
  billItems: [{ id: 3n, caseId: 7n, owner, description: "Specialist consultation", code: undefined, amountCents: 70000n, serviceDate: "2026-09-28" }],
  findings: [{ id: 4n, caseId: 7n, owner, billItemId: 3n, description: "Specialist consultation", amountCents: 70000n, clinicalStatus: "NO_MATCH_FOUND", pricingStatus: "NOT_ASSESSED", confidence: 0.35, evidence: [], explanation: "No match.", action: "REQUEST_REVIEW" }],
  timeline: [
    { id: 2n, caseId: 7n, owner, at: at(5n), title: "Second", detail: "", source: "", status: "complete" },
    { id: 1n, caseId: 7n, owner, at: at(5n), title: "First", detail: "", source: "", status: "complete" }
  ],
  audit: [],
  communications: []
};

describe("assembleCases", () => {
  it("rebuilds the display case in dollars with string ids", () => {
    const [item] = assembleCases(rows);
    expect(item.id).toBe("7");
    expect(item.transaction.amount).toBe(4820);
    expect(item.bill?.total).toBe(4820);
    expect(item.bill?.items[0]).toMatchObject({ id: "3", amount: 700 });
    expect(item.findings[0]).toMatchObject({ billItemId: "3", amount: 700, action: "REQUEST_REVIEW" });
    expect(item.resolution).toMatchObject({ originalTotal: 4820, correctedTotal: 4120, adjustment: 700 });
  });

  it("orders timeline events by insertion id when timestamps tie", () => {
    expect(assembleCases(rows)[0].timeline.map((event) => event.title)).toEqual(["First", "Second"]);
  });

  it("returns no bill until the statement has been delivered", () => {
    const pending = { ...rows, cases: [{ ...rows.cases[0], invoiceId: undefined, billTotalCents: undefined }], billItems: [] };
    expect(assembleCases(pending)[0].bill).toBeNull();
  });
});
