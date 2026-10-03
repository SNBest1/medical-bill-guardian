import { describe, expect, it } from "vitest";
import { matchEncounter } from "./matcher";
import { DEMO_RECORDS, DEMO_TRANSACTION } from "./fixtures";

describe("matchEncounter", () => {
  it("links a payment to a provider encounter within two weeks", () => {
    expect(matchEncounter(DEMO_TRANSACTION, DEMO_RECORDS)?.description).toBe("Emergency room visit after accident");
  });

  it("does not link an unrelated hospital visit", () => {
    expect(matchEncounter(DEMO_TRANSACTION, [{ ...DEMO_RECORDS[0], date: "2026-08-01", provider: "Other Clinic" }])).toBeNull();
  });
});
