import { describe, expect, it } from "vitest";
import type { MedicalBillCase } from "../types/domain";
import { getCaseNumbers, getDemoStage, getFindingTone, getStatusCopy } from "./case-presentation";

describe("case presentation", () => {
  it("maps orchestration statuses to the five demo stages", () => {
    expect(getDemoStage("DETECTED")).toBe("detect");
    expect(getDemoStage("WAITING_FOR_BILL")).toBe("retrieve");
    expect(getDemoStage("ANALYZING")).toBe("reconcile");
    expect(getDemoStage("REVIEW_REQUIRED")).toBe("decide");
    expect(getDemoStage("USER_NOTIFIED")).toBe("complete");
  });

  it("uses cautious, user-facing status language", () => {
    expect(getStatusCopy("REVIEW_REQUIRED")).toBe("Your decision is needed");
    expect(getStatusCopy("FAILED")).toBe("Investigation needs attention");
  });

  it("does not invent savings before provider confirmation", () => {
    const caseData = { transaction: { amount: 4820 }, resolution: null } as MedicalBillCase;
    expect(getCaseNumbers(caseData)).toEqual({ original: 4820, corrected: null, adjustment: 0 });
  });

  it("keeps missing evidence distinct from supported evidence", () => {
    expect(getFindingTone()).toBe("neutral");
    expect(getFindingTone({ action: "REQUEST_REVIEW" } as never)).toBe("attention");
    expect(getFindingTone({ action: "NONE", clinicalStatus: "SUPPORTED" } as never)).toBe("supported");
  });
});
