import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";
import { demoBill, demoRecords } from "../demo";

describe("reconcile", () => {
  it("requires review when a charge has no matching clinical evidence", () => {
    const result = reconcile(demoBill, demoRecords);
    const specialist = result.find((item) => item.description === "Specialist consultation");
    expect(specialist?.clinicalStatus).toBe("NO_MATCH_FOUND");
    expect(specialist?.action).toBe("REQUEST_REVIEW");
    expect(specialist?.explanation).toMatch(/does not prove/i);
  });

  it("supports five documented services without inventing a price comparison", () => {
    const result = reconcile(demoBill, demoRecords);
    expect(result.filter((item) => item.clinicalStatus === "SUPPORTED")).toHaveLength(5);
    expect(result.every((item) => item.pricingStatus === "NOT_ASSESSED")).toBe(true);
  });

  it("links only matching dated clinical records to findings", () => {
    const result = reconcile(demoBill, demoRecords);
    for (const finding of result) {
      const item = demoBill.items.find((item) => item.id === finding.billItemId)!;
      for (const id of finding.evidenceRecordIds ?? []) {
        expect(demoRecords.find((record) => record.id === id)?.date).toBe(item.serviceDate);
      }
    }
    expect(result.find((item) => item.description === "Specialist consultation")?.evidenceRecordIds).toEqual([]);
    expect(result.filter((item) => item.clinicalStatus === "SUPPORTED").every((item) => item.evidenceRecordIds?.length)).toBe(true);
    expect(reconcile(demoBill, demoRecords.map((record) => ({ ...record, date: "1900-01-01" }))).every((item) => item.evidenceRecordIds?.length === 0)).toBe(true);
  });

  it("flags a total mismatch separately from clinical evidence", () => {
    const result = reconcile({ ...demoBill, total: 4800 }, demoRecords);
    expect(result.some((item) => item.clinicalStatus === "AMOUNT_REVIEW")).toBe(true);
  });

  it("matches an exact-name term only against the whole record name, so hemoglobin is not confused with hemoglobin A1c", () => {
    const bill = { invoiceId: "T-1", provider: "Northstar Health System", total: 41, items: [{ id: "bill-1", description: "Hemoglobin", code: "85018", amount: 41, serviceDate: "2026-07-18" }] };
    const a1c = { id: "a1c", type: "lab" as const, description: "Hemoglobin A1c", date: "2026-07-18", provider: "Northstar Health System (Synthetic)" };
    expect(reconcile(bill, [a1c])[0]).toMatchObject({ clinicalStatus: "NO_MATCH_FOUND", action: "REQUEST_REVIEW" });
    expect(reconcile(bill, [a1c, { ...a1c, id: "hgb", description: "Hemoglobin" }])[0]).toMatchObject({ clinicalStatus: "SUPPORTED", evidenceRecordIds: ["hgb"] });
  });

  it("treats a missing record as a question to ask, never as proof the charge is wrong", () => {
    const bill = { invoiceId: "T-2", provider: "Northstar Health System", total: 310, items: [{ id: "bill-1", description: "Electrocardiogram, 12-lead", code: "93000", amount: 310, serviceDate: "2026-07-18" }] };
    const [finding] = reconcile(bill, [{ id: "visit", type: "encounter", description: "Annual wellness visit", date: "2026-07-18", provider: "Northstar Health System (Synthetic)" }]);
    expect(finding).toMatchObject({ clinicalStatus: "NO_MATCH_FOUND", action: "REQUEST_REVIEW" });
    expect(finding.explanation).toMatch(/does not prove the charge is incorrect/);
  });
});
