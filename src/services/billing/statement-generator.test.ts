import { describe, expect, it } from "vitest";
import { savedSnapshot } from "../medical/finchnode-fixtures";
import { generatedStatements } from "../scenario-statements.generated";
import { parseItemizedBill } from "../communications/parse-bill";
import { buildStatement } from "./statement-generator";
import { recipes } from "./recipes";

describe("statement generator", () => {
  it.each(recipes.map((recipe) => [recipe.scenarioId, recipe] as const))("%s: the checked-in statement is exactly what the FinchNode records produce", (_id, recipe) => {
    const built = buildStatement(recipe, savedSnapshot(recipe.subject)!);
    const { scenarioId: _scenarioId, ...stored } = built;
    expect(generatedStatements[recipe.scenarioId]).toEqual(JSON.parse(JSON.stringify(stored)));
    expect(parseItemizedBill(built.statement).total).toBe(built.total);
  });

  it("takes each service date from the records, not from a constant", () => {
    const dates = Object.fromEntries(recipes.map((recipe) => [recipe.scenarioId, buildStatement(recipe, savedSnapshot(recipe.subject)!).serviceDate]));
    expect(dates).toEqual({ "morgan-wellness": "2026-07-18", "harriet-kidney": "2026-01-20", "theo-asthma": "2025-03-22" });
    // Moving the encounter in the records moves the bill's date and the records that may back it.
    const snapshot = structuredClone(savedSnapshot("patient-demo-001")!);
    snapshot.data!.encounters![0].startDate = "2026-07-19T16:00:00Z";
    expect(() => buildStatement(recipes[0], snapshot)).toThrow(/no FinchNode record on 2026-07-19 backs/);
  });

  it("uses real CPT or HCPCS code numbers and 5 to 8 lines per bill, with exactly the intended unsupported lines", () => {
    for (const recipe of recipes) {
      const built = buildStatement(recipe, savedSnapshot(recipe.subject)!);
      expect(built.lines.length).toBeGreaterThanOrEqual(5);
      expect(built.lines.length).toBeLessThanOrEqual(8);
      for (const line of built.lines) expect(line.code).toMatch(/^([A-Z]\d{4}|\d{5})$/);
    }
    const unsupported = Object.fromEntries(recipes.map((recipe) => [recipe.scenarioId, buildStatement(recipe, savedSnapshot(recipe.subject)!).lines.filter((line) => line.unsupported).map((line) => `${line.code} ${line.description}`)]));
    expect(unsupported).toEqual({ "morgan-wellness": ["93000 Electrocardiogram, 12-lead"], "harriet-kidney": ["93000 Electrocardiogram, 12-lead"], "theo-asthma": [] });
  });

  it("refuses to build a bill whose unsupported charge the records actually support", () => {
    const snapshot = structuredClone(savedSnapshot("patient-demo-001")!);
    snapshot.data!.documents!.push({ id: "doc-ecg", description: "Electrocardiogram tracing", createdDate: "2026-07-18T17:00:00Z", sourceName: "Northstar Health System (Synthetic)" });
    expect(() => buildStatement(recipes[0], snapshot)).toThrow(/meant to be unsupported/);
  });

  it("ignores another organization's records and other days' records", () => {
    const snapshot = structuredClone(savedSnapshot("patient-demo-001")!);
    for (const lab of snapshot.data!.labs!) if (lab.name === "Potassium") lab.sourceName = "Elsewhere Clinic";
    for (const lab of snapshot.data!.labs!) if (lab.name === "Hemoglobin A1c") lab.effectiveDate = lab.date = "2026-07-17T15:30:00Z";
    expect(() => buildStatement(recipes[0], snapshot)).toThrow(/no FinchNode record on 2026-07-18 backs "Hemoglobin A1c"/);
  });
});
