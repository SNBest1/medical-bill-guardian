import { describe, expect, it } from "vitest";
import { normalizeFinchRecords } from "./finchnode";

describe("FinchNode normalization", () => {
  it("extracts dated evidence without treating a claim as proof of care", () => {
    const records = normalizeFinchRecords({ data: { encounters: [{ id: "enc-1", description: "Emergency visit", startDate: "2026-09-28T12:00:00Z", sourceName: "University Hospital" }], medicationAdministrations: [{ id: "med-1", name: "Pain medication", date: "2026-09-28T13:00:00Z", sourceName: "University Hospital" }], claims: [{ id: "claim-1", description: "CT scan", date: "2026-09-28", sourceName: "University Hospital" }] } });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ type: "encounter", date: "2026-09-28" });
    expect(records[1]).toMatchObject({ type: "medication", description: "Pain medication" });
  });

  it("reads the normalized sandbox record fields without turning claims into clinical evidence", () => {
    const records = normalizeFinchRecords({ data: {
      encounters: [{ id: "visit-1", type: "Emergency visit", startDate: "2026-09-28T12:00:00Z", sourceName: "University Hospital" }],
      medications: [{ id: "rx-1", name: "Pain medication", startDate: "2026-09-28", sourceName: "University Hospital" }],
      labs: [{ id: "lab-1", name: "Blood count", date: "2026-09-28T14:00:00Z", sourceName: "University Hospital" }],
      diagnosticReports: [{ id: "report-1", name: "CT diagnostic report", effectiveDate: "2026-09-28T15:00:00Z", sourceName: "University Hospital" }],
      claims: [{ id: "claim-1", name: "Specialist consultation", date: "2026-09-28", sourceName: "University Hospital" }]
    } });
    expect(records.map(({ id, type, date }) => ({ id, type, date }))).toEqual([
      { id: "visit-1", type: "encounter", date: "2026-09-28" },
      { id: "rx-1", type: "medication", date: "2026-09-28" },
      { id: "lab-1", type: "lab", date: "2026-09-28" },
      { id: "report-1", type: "document", date: "2026-09-28" }
    ]);
  });
});
