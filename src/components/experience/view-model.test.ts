import { describe, expect, it } from "vitest";
import { demoRecords, demoStatement, demoTransaction } from "../../services/demo";
import { createCase, receiveItemizedStatement } from "../../services/agent/orchestrator";
import { caseViewModel } from "./view-model";

describe("caseViewModel", () => {
  it("opens with an authorization step before retrieving the bill", () => {
    const view = caseViewModel(createCase(demoTransaction));
    expect(view.beat).toBe("bill");
    expect(view.canCollect).toBe(true);
    expect(view.canReview).toBe(false);
  });

  it("shows the supported charges and uncertain charge after analysis", () => {
    const initial = createCase(demoTransaction);
    initial.status = "WAITING_FOR_BILL";
    initial.medicalRecords = demoRecords;
    initial.communications.push({ id: "request-1", type: "ITEMIZED_BILL_REQUEST", status: "PENDING", timestamp: new Date().toISOString(), transcript: "Requested itemized bill" });
    const reviewed = receiveItemizedStatement(initial, demoStatement);
    const view = caseViewModel(reviewed);
    expect(view.beat).toBe("evidence");
    expect(view.supportedCount).toBe(5);
    expect(view.questionFinding?.amount).toBe(700);
    expect(view.canReview).toBe(true);
  });

  it("reveals the outcome only after a persisted resolution exists", () => {
    const caseData = createCase(demoTransaction);
    caseData.status = "RESOLVED";
    expect(caseViewModel(caseData).beat).not.toBe("outcome");
    caseData.resolution = { result: "DUPLICATE_REMOVED", originalTotal: 4820, correctedTotal: 4120, adjustment: 700, explanation: "Specialist charge removed." };
    expect(caseViewModel(caseData)).toMatchObject({ beat: "outcome", correctedAmount: 4120, adjustment: 700 });
  });

  it("shows the live reading beat only while a texted PDF is being read", () => {
    const waiting = createCase(demoTransaction);
    waiting.status = "WAITING_FOR_BILL";
    expect(caseViewModel(waiting).beat).toBe("collecting");
    waiting.reading = { startedAt: new Date().toISOString(), steps: [], done: false };
    expect(caseViewModel(waiting)).toMatchObject({ beat: "reading", isReading: true });
    waiting.reading = { ...waiting.reading, done: true, failed: true };
    expect(caseViewModel(waiting)).toMatchObject({ beat: "collecting", isReading: false });
  });
});
