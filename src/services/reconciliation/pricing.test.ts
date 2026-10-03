import { describe, expect, it } from "vitest";
import { demoBill, demoRecords } from "../demo";
import { reconcile } from "./reconcile";
import { comparePrices, type PriceReference } from "./pricing";

// Synthetic test rate only, never installed as a production reference.
const reference: PriceReference = { code: "99285", provider: "University Hospital", referenceAmount: 400, sourceName: "Synthetic test reference", sourceUrl: "https://example.com/test-only", basis: "CASH", asOf: "2026-09-01", validFrom: "2026-01-01", validThrough: "2026-12-31", units: 1, setting: "OUTPATIENT", component: "FACILITY", modifiers: [] };
const qualifiedBill = { ...demoBill, items: demoBill.items.map((item) => ({ ...item, units: 1, setting: "OUTPATIENT" as const, component: "FACILITY" as const, modifiers: [] })) };
const selfPay = { coverage: "SELF_PAY" as const, network: "UNKNOWN" as const, claimStatus: "UNKNOWN" as const };
describe("source-backed price comparison", () => {
  it("keeps clinical support separate from a high price review lead", () => {
    const result = comparePrices(qualifiedBill, reconcile(qualifiedBill, demoRecords), [reference], selfPay)[0];
    expect(result.clinicalStatus).toBe("SUPPORTED");
    expect(result.action).toBe("REQUEST_REVIEW");
    expect(result.priceComparison?.multiple).toBe(2.75);
    expect(result.priceComparison?.sourceUrl).toBe(reference.sourceUrl);
  });
  it("does not compare missing codes, different hospitals, stale rates, or ambiguous references", () => {
    const initial = reconcile(demoBill, demoRecords);
    for (const rates of [[], [{ ...reference, provider: "Other Hospital" }], [{ ...reference, validThrough: "2025-12-31" }], [reference, reference]]) {
      expect(comparePrices(demoBill, initial, rates)).toEqual(initial);
    }
    expect(comparePrices(demoBill, initial, [reference])[1].pricingStatus).toBe("NOT_ASSESSED");
  });
  it("does not compare a cash rate with an insured plan or mix setting, units, or component", () => {
    const initial = reconcile(qualifiedBill, demoRecords);
    const insured = { coverage: "INSURED" as const, network: "IN_NETWORK" as const, claimStatus: "FINAL" as const, payer: "Payer", plan: "Plan" };
    expect(comparePrices(qualifiedBill, initial, [reference], insured)).toEqual(initial);
    for (const rate of [{ ...reference, component: "PROFESSIONAL" as const }, { ...reference, setting: "INPATIENT" as const }, { ...reference, units: 2 }, { ...reference, modifiers: ["26"] }]) expect(comparePrices(qualifiedBill, initial, [rate], selfPay)).toEqual(initial);
    const negotiated = { ...reference, basis: "NEGOTIATED" as const, payer: "Payer", plan: "Plan" };
    expect(comparePrices(qualifiedBill, initial, [negotiated], insured)[0].pricingStatus).toBe("REVIEW");
    expect(comparePrices(qualifiedBill, initial, [{ ...negotiated, plan: "Different plan" }], insured)).toEqual(initial);
  });
});
