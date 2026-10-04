import { describe, expect, it } from "vitest";
import { createCase } from "../services/agent/orchestrator";
import { demoTransaction } from "../services/demo";
import { formatActionError, getCaseNumbers, getDemoStage, getFindingTone, getItemizedBillRequestCopy, getStatusCopy } from "./case-presentation";

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

  it("distinguishes call authorization from the synthetic statement workflow", () => {
    expect(getItemizedBillRequestCopy("REQUESTING_BILL")).toEqual({
      heading: "Call hospital billing for the itemized statement?",
      detail: expect.stringMatching(/authorization.*configured consenting demo recipient/i),
    });
    expect(getItemizedBillRequestCopy("WAITING_FOR_BILL")).toEqual({
      heading: "Call queued. Preparing the demo statement.",
      detail: expect.stringMatching(/synthetic fixture.*not.*collected by the call/i),
    });
    expect(getItemizedBillRequestCopy("DETECTED")).toBeNull();

    for (const status of ["REQUESTING_BILL", "WAITING_FOR_BILL"] as const) {
      const copy = getItemizedBillRequestCopy(status);
      expect(`${copy?.heading} ${copy?.detail}`).not.toMatch(/call (delivered|received|collected) (the |an )?statement/i);
    }
  });

  it("surfaces safe Fish failure details without changing ordinary errors", () => {
    expect(formatActionError({
      error: "Fish Audio call failed",
      upstreamStatus: 402,
      responseBody: '{"error":"insufficient_credit"}',
    }, "Fallback")).toBe('Fish Audio call failed (HTTP 402): {"error":"insufficient_credit"}');
    expect(formatActionError({ error: "Authorization is required" }, "Fallback")).toBe("Authorization is required");
    expect(formatActionError({}, "Fallback")).toBe("Fallback");
  });

  it("does not invent savings before provider confirmation", () => {
    const caseData = createCase(demoTransaction);
    expect(getCaseNumbers(caseData)).toEqual({ original: 4820, corrected: null, adjustment: 0 });
  });

  it("keeps missing evidence distinct from supported evidence", () => {
    expect(getFindingTone()).toBe("neutral");
    expect(getFindingTone({ action: "REQUEST_REVIEW" } as never)).toBe("attention");
    expect(getFindingTone({ action: "NONE", clinicalStatus: "SUPPORTED" } as never)).toBe("supported");
  });
});
