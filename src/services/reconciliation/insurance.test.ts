import { describe, expect, it } from "vitest";
import { demoBill } from "../demo";
import { assessPatientBalance, validateInsurance } from "./insurance";
import type { InsuranceContext } from "../../types/domain";

const insured: InsuranceContext = { coverage: "INSURED", network: "IN_NETWORK", claimStatus: "FINAL", payer: "Test payer", plan: "Test plan", eob: { invoiceId: demoBill.invoiceId, serviceDate: "2026-09-28", billedTotal: 4820, allowedTotal: 3000, contractualAdjustment: 1820, insurerPaid: 2400, otherPayerPaid: 0, deductible: 400, copay: 0, coinsurance: 200, noncovered: 0, patientResponsibility: 600 } };
describe("insurance-aware patient balance", () => {
  it("uses actual EOB allocations instead of gross charges or a guessed percentage", () => {
    const result = assessPatientBalance(demoBill, 4820, insured);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.expectedPatientResponsibility).toBe(600);
    expect(result.possibleExcessPayment).toBe(4220);
    expect(result.reasons.join(" ")).toMatch(/not a confirmed refund/);
  });
  it("does not estimate from a pending claim, unknown coverage, or an unrelated EOB", () => {
    expect(assessPatientBalance(demoBill, 4820).expectedPatientResponsibility).toBeUndefined();
    expect(assessPatientBalance(demoBill, 4820, { ...insured, claimStatus: "PENDING" }).status).toBe("CLAIM_PENDING");
    expect(assessPatientBalance(demoBill, 4820, { ...insured, eob: { ...insured.eob!, invoiceId: "other" } }).expectedPatientResponsibility).toBeUndefined();
  });
  it("flags a denied claim for review instead of treating the denial as missing information or full patient liability", () => {
    const denied = assessPatientBalance(demoBill, 4820, { ...insured, claimStatus: "DENIED" });
    expect(denied.status).toBe("REVIEW_REQUIRED");
    expect(denied.expectedPatientResponsibility).toBeUndefined();
    expect(denied.reasons.join(" ")).toMatch(/does not by itself make the patient liable/);
    const deniedWithoutEob = assessPatientBalance(demoBill, 4820, { coverage: "INSURED", network: "IN_NETWORK", claimStatus: "DENIED" });
    expect(deniedWithoutEob.reasons.join(" ")).toMatch(/denial notice/);
  });
  it("recognizes actual out-of-pocket cap/secondary-payer allocations from the final EOB", () => {
    const eob = { ...insured.eob!, insurerPaid: 2800, otherPayerPaid: 200, deductible: 0, coinsurance: 0, patientResponsibility: 0 };
    expect(assessPatientBalance({ ...demoBill, patientResponsibility: 0 }, 0, { ...insured, eob }).status).toBe("RECONCILED");
  });
  it("rejects invalid monetary inputs and requests clarification of inconsistent allocations", () => {
    expect(() => validateInsurance({ ...insured, eob: { ...insured.eob!, deductible: -1 } })).toThrow(/nonnegative/);
    expect(() => validateInsurance({ ...insured, eob: { ...insured.eob!, deductible: 1.234 } })).toThrow(/two decimals/);
    const result = assessPatientBalance(demoBill, 4820, { ...insured, eob: { ...insured.eob!, insurerPaid: 2399 } });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.expectedPatientResponsibility).toBeUndefined();
  });
});
