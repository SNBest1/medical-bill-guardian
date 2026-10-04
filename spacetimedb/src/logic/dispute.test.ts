import { describe, expect, it } from "vitest";
import { DEMO_RECORDS, DEMO_STATEMENT } from "./fixtures";
import { parseItemizedBill } from "./parse-bill";
import { reconcile } from "./reconcile";
import { claimForInvoice, summarizeClaim } from "./insurance";
import { comparePrices } from "./pricing";
import { composeDispute } from "./dispute";
import { PRICE_RATES, PRICE_SOURCE } from "./price-references";

const bill = parseItemizedBill(DEMO_STATEMENT);
const claim = claimForInvoice(bill.invoiceId)!;

describe("claim deduction", () => {
  it("has a synthetic claim only for the demo invoice", () => {
    expect(claim.synthetic).toBe(true);
    expect(claimForInvoice("OTHER-1")).toBeNull();
  });

  it("deducts the insurer's adjudication to find what the patient owes and may have overpaid", () => {
    expect(summarizeClaim(claim, bill, 482000)).toMatchObject({ billedCents: 482000, allowedCents: 302311, contractualCents: 179689, insurerPaidCents: 201849, deductibleCents: 50000, coinsuranceCents: 50462, patientResponsibilityCents: 100462, possibleOverpaymentCents: 381538, status: "REVIEW_REQUIRED" });
  });

  it("flags a claim whose billed total does not match the statement", () => {
    const summary = summarizeClaim(claim, { ...bill, totalCents: 480000 }, 482000);
    expect(summary.status).toBe("REVIEW_REQUIRED");
    expect(summary.notes).toContain("The claim's billed amount does not match the statement total.");
  });
});

describe("comparePrices", () => {
  it("compares insured allowed amounts with the plan's published contract rates", () => {
    const results = comparePrices(bill, claim, PRICE_RATES);
    const ct = results.find((item) => item.lineIndex === 2);
    expect(ct).toMatchObject({ referenceCents: 14714, comparedCents: 29428, comparedField: "ALLOWED", basis: "NEGOTIATED", multiple: 2, review: true });
    expect(results.find((item) => item.lineIndex === 0)).toMatchObject({ referenceCents: 168363, review: false });
    expect(results.some((item) => item.lineIndex === 5 || item.lineIndex === 6)).toBe(false); // J2405 and 99244 have no published rate
  });

  it("compares billed amounts with discounted cash prices when there is no claim, flagging at 2x", () => {
    const results = comparePrices(bill, null, PRICE_RATES);
    expect(results.find((item) => item.lineIndex === 3)).toMatchObject({ basis: "CASH", comparedField: "BILLED", referenceCents: 12480, review: false });
  });
});

describe("composeDispute", () => {
  const findings = reconcile(bill, DEMO_RECORDS);
  const comparisons = comparePrices(bill, claim, PRICE_RATES);
  const summary = summarizeClaim(claim, bill, 482000);
  const text = composeDispute({ caseLabel: "CASE-4821", bill, findings, comparisons, summary, paidCents: 482000, source: PRICE_SOURCE });

  it("cites the questioned charges, the published rate, and the insurance math", () => {
    expect(text).toContain("Invoice UMH-48291");
    expect(text).toContain("Specialist consultation (99244) $700");
    expect(text).toContain("CT head without contrast (70450)");
    expect(text).toContain("$294.28");
    expect(text).toContain("$147.14");
    expect(text).toContain(PRICE_SOURCE.url);
    expect(text).toContain("Patient responsibility per the claim: $1,004.62");
    expect(text).toContain("Possible overpayment: $3,815.38");
  });

  it("does not overclaim or list supported, fairly priced charges", () => {
    expect(text).not.toMatch(/fraud|scam|criminal|illegal/i);
    expect(text).not.toContain("Emergency room visit (99285)");
    expect(text.length).toBeLessThan(8000);
  });
});
