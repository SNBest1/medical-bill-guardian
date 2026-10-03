import { describe, expect, it } from "vitest";
import { normalizeFinchRecords } from "./finchnode";

describe("FinchNode normalization", () => {
  it("extracts dated evidence without treating a claim as proof of care", () => {
    const records = normalizeFinchRecords({ data: { encounters: [{ id: "enc-1", description: "Emergency visit", startDate: "2026-09-28T12:00:00Z", sourceName: "University Hospital" }], medicationAdministrations: [{ id: "med-1", name: "Pain medication", date: "2026-09-28T13:00:00Z", sourceName: "University Hospital" }], claims: [{ id: "claim-1", description: "CT scan", date: "2026-09-28", sourceName: "University Hospital" }] } });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ type: "encounter", date: "2026-09-28" });
    expect(records[1]).toMatchObject({ type: "medication", description: "Pain medication" });
  });
});
