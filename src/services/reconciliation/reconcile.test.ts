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
});
