import { describe, expect, it } from "vitest";
import { scenarios, scenarioForTransaction } from "./scenarios";
import { MockBankProvider } from "./banking/mock";
import { MockMedicalRecordProvider } from "./medical/mock";
import { MockCommunicationProvider } from "./communications/mock";
import { analyzeCase, createCase, investigateCase, notifyCase, reviewCase } from "./agent/orchestrator";
import { parseItemizedBill } from "./communications/parse-bill";
import { reconcile } from "./reconciliation/reconcile";
import { generatedStatements } from "./scenario-statements.generated";

describe("judge scenarios", () => {
  it("are the three FinchNode demo patients, who share one hospital", () => {
    expect(scenarios.map((scenario) => `${scenario.id}:${scenario.finchSubject}`)).toEqual(["morgan-wellness:patient-demo-001", "harriet-kidney:patient-demo-polypharmacy", "theo-asthma:patient-demo-pediatric-asthma"]);
    expect(new Set(scenarios.map((scenario) => scenario.hospital.name))).toEqual(new Set(["Northstar Health System"]));
    expect(new Set(scenarios.map((scenario) => scenario.transaction.amount)).size).toBe(3);
  });
  for (const scenario of scenarios) {
    it(`${scenario.id}: bill parses, totals match the payment, and only the intended charge is flagged`, async () => {
      const bill = parseItemizedBill(scenario.statement);
      expect(bill.provider).toBe(scenario.hospital.name);
      expect(bill.total).toBe(scenario.transaction.amount);
      expect(bill.items[0].serviceDate).toBe(scenario.transaction.date);
      expect(bill.items.length).toBeGreaterThanOrEqual(5);
      expect(bill.items.length).toBeLessThanOrEqual(8);
      expect(bill.items.reduce((sum, item) => sum + item.amount, 0)).toBe(bill.total);
      const records = await new MockMedicalRecordProvider().getMedicalRecords(scenario.transaction);
      const findings = reconcile(bill, records);
      const flagged = findings.filter((finding) => finding.action === "REQUEST_REVIEW");
      expect(flagged.map((finding) => finding.description)).toEqual(scenario.outcome.flagged ? [scenario.outcome.flagged] : []);
      // Missing evidence is a question, never a verdict.
      for (const finding of flagged) { expect(finding.clinicalStatus).toBe("NO_MATCH_FOUND"); expect(finding.explanation).toMatch(/does not prove/); }
      expect(findings.filter((finding) => finding.clinicalStatus === "SUPPORTED")).toHaveLength(bill.items.length - flagged.length);
    });
    it(`${scenario.id}: every supported charge is backed by a record FinchNode returned for the service date`, async () => {
      const generated = generatedStatements[scenario.id];
      expect(generated.statement).toBe(scenario.statement);
      const records = await new MockMedicalRecordProvider().getMedicalRecords(scenario.transaction);
      const byId = new Map(records.map((record) => [record.id, record]));
      expect(records.every((record) => record.date === scenario.transaction.date)).toBe(true);
      for (const line of generated.lines) {
        if (line.unsupported) { expect(line.evidence).toEqual([]); continue; }
        expect(line.evidence.length).toBeGreaterThan(0);
        for (const backing of line.evidence) expect(byId.get(backing.id)?.description).toBe(backing.name);
      }
      expect(byId.has(generated.encounter.id)).toBe(true);
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
