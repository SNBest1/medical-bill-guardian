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

  it("flags a total mismatch separately from clinical evidence", () => {
    const result = reconcile({ ...demoBill, total: 4800 }, demoRecords);
    expect(result.some((item) => item.clinicalStatus === "AMOUNT_REVIEW")).toBe(true);
  });
});
