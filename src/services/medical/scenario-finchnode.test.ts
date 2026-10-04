import { describe, expect, it } from "vitest";
import { legacyScenario, scenarios } from "../scenarios";
import { SCENARIO_RECORDS_LABEL, ScenarioFinchNodeProvider, scenarioFinchSnapshot } from "./scenario-finchnode";
import { createCase, investigateCase } from "../agent/orchestrator";
import { MockCommunicationProvider } from "../communications/mock";

const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));

describe("scenario FinchNode record adapter", () => {
  it("round-trips every scenario's records through the real FinchNode normalizer", async () => {
    for (const scenario of [...scenarios, legacyScenario]) {
      const records = await new ScenarioFinchNodeProvider().getMedicalRecords(scenario.transaction);
      expect(byId(records)).toEqual(byId(scenario.records));
    }
  });

  it("emits FinchNode categories, with imaging as diagnostic reports and procedures separate", () => {
    const snapshot = scenarioFinchSnapshot(scenarios[0].records);
    expect(Object.keys(snapshot.data!)).toEqual(expect.arrayContaining(["encounters", "medications", "diagnosticReports", "procedures"]));
    expect(snapshot.data!.diagnosticReports![0]).toMatchObject({ category: "imaging" });
  });

  it("labels the retrieval honestly on the case", async () => {
    const scenario = scenarios[0];
    const next = await investigateCase(createCase(scenario.transaction), new ScenarioFinchNodeProvider(), new MockCommunicationProvider(Number.POSITIVE_INFINITY));
    expect(next.recordSource).toEqual({ label: SCENARIO_RECORDS_LABEL, live: false });
    expect(next.auditLog.find((entry) => entry.action === "FETCH_RECORDS")?.outputSummary).toContain("no live FinchNode call");
    expect(next.timeline.find((event) => event.title === "Medical records retrieved")?.detail).toContain("no live FinchNode call");
  });
});
