import { describe, expect, it } from "vitest";
import { scenarios } from "./scenarios";
import { parseItemizedBill } from "./communications/parse-bill";
import { reconcile } from "./reconciliation/reconcile";

describe("judge scenarios", () => {
  for (const scenario of scenarios) {
    it(`${scenario.id}: bill parses, totals match the payment, and only the intended charge is flagged`, () => {
      const bill = parseItemizedBill(scenario.statement);
      expect(bill.provider).toBe(scenario.hospital.name);
      expect(bill.total).toBe(scenario.transaction.amount);
      expect(bill.items.reduce((sum, item) => sum + item.amount, 0)).toBe(bill.total);
      const flagged = reconcile(bill, scenario.records).filter((finding) => finding.action === "REQUEST_REVIEW").map((finding) => finding.description);
      expect(flagged).toEqual(scenario.outcome.flagged ? [scenario.outcome.flagged] : []);
    });
  }
});
