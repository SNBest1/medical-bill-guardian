import { describe, expect, it, vi } from "vitest";
import { classifyReviewCall, resolutionFromCall, spokenInvoice, transcriptOf, type FishSession } from "./fish-review";
import { FishDemoCommunicationProvider, type FishDemoConfig } from "./fish-demo";
import { receiveItemizedStatement, settleReviewCall, reviewCase, createCase, notifyCase } from "../agent/orchestrator";
import { getScenario } from "../scenarios";
import { MockCommunicationProvider } from "./mock";
import { parseItemizedBill } from "./parse-bill";
import { reconcile } from "../reconciliation/reconcile";

const config: FishDemoConfig = { apiKey: "k", agentId: "bill-agent", phoneNumberId: "p", toNumber: "+15555550100", hospitalPhone: "+15555550100", guardianLine: "+15555550142", reviewAgentId: "review-agent" };
const session = (status: string, ...turns: [string, string][]): FishSession => ({ status, items: turns.map(([role, content]) => ({ type: "message", role, content })) });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("classifyReviewCall", () => {
  it("reads a removal only from the hospital side", () => {
    expect(classifyReviewCall(session("completed", ["assistant", "Please remove the charge and refund it."], ["user", "Okay, we will remove that charge."]))).toBe("REMOVED");
    expect(classifyReviewCall(session("completed", ["assistant", "Can you remove it? Is it a duplicate?"]))).toBe("INCONCLUSIVE");
  });
  it("never reads a refusal as a concession", () => {
    expect(classifyReviewCall(session("completed", ["user", "We can't remove that."], ["user", "It wasn't a duplicate."]))).toBe("INCONCLUSIVE");
  });
  it("recognizes a charge the hospital stands behind", () => {
    expect(classifyReviewCall(session("completed", ["user", "I found the signed order. The charge is valid and stands."]))).toBe("VERIFIED");
  });
  it("is inconclusive when the hospital never spoke", () => {
    expect(classifyReviewCall(session("completed"))).toBe("INCONCLUSIVE");
  });
});

describe("helpers", () => {
  it("speaks invoice numbers digit by digit", () => expect(spokenInvoice("NS-71802")).toBe("N S; 7 1 8 0 2"));
  it("orders a transcript as Guardian and billing representative", () => {
    expect(transcriptOf(session("active", ["assistant", " Hello "], ["user", "Hi"]))).toBe("Guardian: Hello\nBilling representative: Hi");
  });
});

async function reviewReady() {
  const scenario = getScenario("morgan-wellness")!;
  const bill = parseItemizedBill(scenario.statement);
  let current = createCase(scenario.transaction);
  current.scenarioId = scenario.id;
  current.status = "WAITING_FOR_BILL";
  current.communications.push({ id: "r1", type: "ITEMIZED_BILL_REQUEST", timestamp: new Date().toISOString(), status: "PENDING", transcript: "" });
  current.medicalRecords = [{ id: "m1", type: "encounter", description: "Annual wellness visit", date: scenario.transaction.date, provider: scenario.hospital.name }];
  current = receiveItemizedStatement(current, scenario.statement);
  // The FinchNode records are pulled live in the app; here only the ECG lacks a matching record.
  current.findings = current.findings.map((finding) => finding.description.startsWith("Electrocardiogram") ? finding : { ...finding, clinicalStatus: "SUPPORTED", action: "NONE" });
  void bill; void reconcile;
  return current;
}

describe("live review call", () => {
  it("places the dispute call without resolving anything, then settles from the transcript", async () => {
    const current = await reviewReady();
    expect(current.status).toBe("REVIEW_REQUIRED");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).includes("/sessions/")
      ? json({ status: "completed", items: [{ type: "message", role: "assistant", content: "Your records show no ECG." }, { type: "message", role: "user", content: "We will remove the electrocardiogram charge." }] })
      : json({ session_id: "rev-1" }, 201));
    const provider = new FishDemoCommunicationProvider(config, fetcher, new MockCommunicationProvider(0));

    const waiting = await reviewCase(current, provider, true);
    expect(waiting.status).toBe("WAITING_FOR_PROVIDER");
    expect(waiting.resolution).toBeNull();
    expect(waiting.recovery).toBeUndefined();
    const call = fetcher.mock.calls[0];
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ agent_id: "review-agent", to_number: "+15555550100", dynamic_variables: { flagged_amount: "310 dollars", corrected_total: "792 dollars", invoice_id_spoken: "N S; 7 1 8 0 2" } });
    expect((call[1]?.headers as Record<string, string>)["Idempotency-Key"]).toContain("billing-review");

    const settled = await settleReviewCall(waiting, provider);
    expect(settled.status).toBe("RESOLVED");
    expect(settled.resolution).toMatchObject({ result: "DUPLICATE_REMOVED", adjustment: 310, correctedTotal: 792 });
    expect(settled.recovery).toMatchObject({ status: "REFUND_PENDING", amount: 310 });
    expect((await notifyCase(settled, provider)).status).toBe("USER_NOTIFIED");
  });

  it("keeps waiting while the call is active and resolves an unclear call as unchanged", async () => {
    const current = await reviewReady();
    let status = "active";
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).includes("/sessions/") ? json({ status, items: [{ type: "message", role: "user", content: "Let me check." }] }) : json({ session_id: "rev-2" }, 201));
    const provider = new FishDemoCommunicationProvider(config, fetcher, new MockCommunicationProvider(0));
    const waiting = await reviewCase(current, provider, true);
    const still = await settleReviewCall(waiting, provider);
    expect(still.status).toBe("WAITING_FOR_PROVIDER");
    expect(still.communications.find((c) => c.type === "BILLING_REVIEW")?.transcript).toContain("Let me check.");
    status = "completed";
    const ended = await settleReviewCall(still, provider);
    expect(ended.resolution).toMatchObject({ result: "UNRESOLVED", adjustment: 0, correctedTotal: 1102 });
    expect(ended.recovery).toBeUndefined();
  });

  it("falls back to the rehearsed script when no dispute agent is configured", async () => {
    const current = await reviewReady();
    const fetcher = vi.fn<typeof fetch>();
    const provider = new FishDemoCommunicationProvider({ ...config, reviewAgentId: undefined }, fetcher, new MockCommunicationProvider(0));
    const done = await reviewCase(current, provider, true);
    expect(done.status).toBe("RESOLVED");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("resolutionFromCall", () => {
  it("takes amounts from the bill, not from speech", () => {
    const bill = parseItemizedBill(getScenario("morgan-wellness")!.statement);
    expect(resolutionFromCall("REMOVED", bill, "Electrocardiogram, 12-lead", 310)).toMatchObject({ originalTotal: 1102, correctedTotal: 792, adjustment: 310 });
  });
});
