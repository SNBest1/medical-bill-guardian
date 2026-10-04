import { describe, expect, it } from "vitest";
import { scenarios, scenarioForTransaction } from "./scenarios";
import { MockBankProvider } from "./banking/mock";
import { MockMedicalRecordProvider } from "./medical/mock";
import { MockCommunicationProvider } from "./communications/mock";
import { analyzeCase, createCase, investigateCase, notifyCase, reviewCase } from "./agent/orchestrator";
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

describe("judge scenarios end to end", () => {
  for (const scenario of scenarios) {
    it(`${scenario.id}: the agent works the picked patient's bill from payment to notification`, async () => {
      const [payment] = await new MockBankProvider(scenario.id).getTransactions();
      expect(payment.merchant).toBe(scenario.hospital.name);
      const comms = new MockCommunicationProvider(0);
      const opened = createCase({ ...payment, id: "nessie-purchase-from-another-id" });
      expect(scenarioForTransaction(opened.transaction)?.id).toBe(scenario.id);
      const analyzed = await analyzeCase(await investigateCase(opened, new MockMedicalRecordProvider(), comms), comms);
      expect(analyzed.bill?.total).toBe(scenario.transaction.amount);
      if (!scenario.outcome.flagged) {
        expect(analyzed.status).toBe("RESOLVED");
        expect(analyzed.findings.every((finding) => finding.action === "NONE")).toBe(true);
        return;
      }
      expect(analyzed.status).toBe("REVIEW_REQUIRED");
      await expect(reviewCase(analyzed, comms, false)).rejects.toThrow(/authorization/i);
      const reviewed = await reviewCase(analyzed, comms, true);
      const flaggedAmount = analyzed.findings.find((finding) => finding.description === scenario.outcome.flagged)!.amount;
      const removed = scenario.outcome.result === "DUPLICATE_REMOVED";
      expect(reviewed.resolution).toMatchObject({ result: scenario.outcome.result, adjustment: removed ? flaggedAmount : 0, correctedTotal: scenario.transaction.amount - (removed ? flaggedAmount : 0) });
      expect(Boolean(reviewed.recovery)).toBe(removed);
      expect((await notifyCase(reviewed, comms)).status).toBe("USER_NOTIFIED");
    });
  }
});
