import { describe, expect, it } from "vitest";
import { createCase } from "../agent/orchestrator";
import { getScenario } from "../scenarios";
import { parseItemizedBill } from "../communications/parse-bill";
import { reconcile } from "./reconcile";
import { costView } from "./cost-view";

function patient(id: string) {
  const s = getScenario(id)!;
  const c = createCase(s.transaction);
  c.bill = parseItemizedBill(s.statement);
  c.findings = reconcile(c.bill, s.records);
  return c;
}
describe("sourced billed and expected costs", () => {
  it("shows Harriet's dated CMS lab benchmark without turning it into an owed amount or refund", () => {
    const c = patient("harriet-kidney");
    const row = costView(c, []).find((r) => r.code === "83036")!;
    expect(row.charged).toBe(94);
    expect(row.benchmark?.amount).toBe(9.71);
    expect(row.benchmark?.name).toContain("CMS");
    expect(row.benchmark?.validFrom).toBe("2026-01-01");
    expect(row.expected).toBeNull();
    expect(row.difference).toBeNull();
    expect(c.recovery).toBeUndefined();
    expect(costView(c, []).find((r) => r.code === "99214")?.benchmark).toBeNull();
  });
  it("uses the service date and never substitutes a later rate for an older bill", () => {
    const c = patient("morgan-wellness");
    expect(costView(c, []).find((r) => r.code === "83036")?.benchmark?.validFrom).toBe("2026-07-01");
    c.bill!.items.forEach((item) => { item.serviceDate = "2025-07-18"; });
    expect(costView(c, []).every((r) => r.benchmark === null)).toBe(true);
  });
  it("shows an expected price only when the provider and billing context match a sourced rate", () => {
    const c = patient("harriet-kidney");
    const item = c.bill!.items.find((r) => r.code === "83036")!;
    Object.assign(item, { units: 1, setting: "OUTPATIENT", component: "GLOBAL", modifiers: [] });
    const rate = { code: "83036", provider: c.bill!.provider, referenceAmount: 25, sourceName: "Verified hospital cash rate", sourceUrl: "https://example.com/rate", basis: "CASH" as const, asOf: "2026-01-01", validFrom: "2026-01-01", validThrough: "2026-12-31", units: 1, setting: "OUTPATIENT" as const, component: "GLOBAL" as const, modifiers: [] };
    expect(costView(c, [rate]).find((r) => r.code === "83036")?.expected).toBe(25);
    expect(costView(c, [{ ...rate, provider: "Other hospital" }]).find((r) => r.code === "83036")?.expected).toBeNull();
  });
});
