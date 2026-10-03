import { describe, expect, it } from "vitest";
import { matchEncounter } from "./matcher";
import { demoRecords, demoTransaction } from "../demo";

describe("encounter matching", () => {
  it("links a payment to a provider encounter within two weeks", () => {
    expect(matchEncounter(demoTransaction, demoRecords)?.id).toBe("record-er");
  });

  it("does not link an unrelated hospital visit", () => {
    const unrelated = [{ ...demoRecords[0], date: "2026-08-01", provider: "Other Clinic" }];
    expect(matchEncounter(demoTransaction, unrelated)).toBeNull();
  });
});
