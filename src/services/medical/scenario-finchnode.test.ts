import { describe, expect, it } from "vitest";
import { legacyScenario } from "../scenarios";
import { SCENARIO_RECORDS_LABEL, ScenarioFinchNodeProvider, scenarioFinchSnapshot } from "./scenario-finchnode";
import { createCase, investigateCase } from "../agent/orchestrator";
import { MockCommunicationProvider } from "../communications/mock";

const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
const withoutCategory = <T extends { category?: string }>(items: T[]) => items.map(({ category: _category, ...rest }) => rest);

describe("rehearsal-case FinchNode record adapter", () => {
  it("round-trips the original University Hospital records through the real FinchNode normalizer", async () => {
    const records = await new ScenarioFinchNodeProvider().getMedicalRecords(legacyScenario.transaction);
    expect(withoutCategory(byId(records))).toEqual(byId(legacyScenario.records));
  });

  it("emits FinchNode categories, with imaging as diagnostic reports and procedures separate", () => {
    const snapshot = scenarioFinchSnapshot(legacyScenario.records);
    expect(Object.keys(snapshot.data!)).toEqual(expect.arrayContaining(["encounters", "medications", "diagnosticReports", "procedures"]));
    expect(snapshot.data!.diagnosticReports![0]).toMatchObject({ category: "imaging" });
  });

  it("labels the retrieval honestly on the case: no live FinchNode call", async () => {
    const next = await investigateCase(createCase(legacyScenario.transaction), new ScenarioFinchNodeProvider(), new MockCommunicationProvider(Number.POSITIVE_INFINITY));
    expect(next.recordSource).toEqual({ label: SCENARIO_RECORDS_LABEL, live: false });
    expect(next.auditLog.find((entry) => entry.action === "FETCH_RECORDS")?.outputSummary).toContain("no live FinchNode call");
    expect(next.timeline.find((event) => event.title === "Medical records retrieved")?.detail).toContain("no live FinchNode call");
  });

  it("does not serve records for the FinchNode patients: those come from a real pull", async () => {
    const { scenarios } = await import("../scenarios");
    await expect(new ScenarioFinchNodeProvider().getMedicalRecords(scenarios[0].transaction)).resolves.toEqual([]);
  });
});
