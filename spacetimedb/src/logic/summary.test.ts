import { describe, expect, it } from "vitest";
import { buildSummary } from "./summary";
import { billingReview } from "./fixtures";

describe("buildSummary", () => {
  it("explains the provider-confirmed correction in plain language", () => {
    const { resolution } = billingReview("University Hospital", "UH-48291", "Specialist consultation");
    const text = buildSummary({ provider: "University Hospital", supported: 5, questioned: [{ description: "Specialist consultation", amountCents: 70000 }], resolution });
    expect(text).toBe("We reviewed your University Hospital bill and compared its charges with your available medical records. 5 services had supporting records. We could not verify Specialist consultation ($700) from those records, so we asked hospital billing to review it. The hospital confirmed that the $700 specialist consultation duplicated services already included in the emergency room charge and removed it. The bill changed from $4,820 to $4,120, a $700 correction.");
  });

  it("does not mention a correction when every charge was supported", () => {
    const text = buildSummary({ provider: "University Hospital", supported: 1, questioned: [], resolution: null });
    expect(text).toBe("We reviewed your University Hospital bill and compared its charges with your available medical records. 1 service had supporting records.");
  });
});
