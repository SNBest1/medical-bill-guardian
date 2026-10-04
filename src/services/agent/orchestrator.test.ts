import { describe, expect, it } from "vitest";
import { createCase, investigateCase, requestItemizedBill, analyzeCase, reviewCase, notifyCase, receiveDemoRefund, receiveItemizedStatement, ContactAmbiguousError } from "./orchestrator";
import { demoTransaction, demoStatement } from "../demo";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";

describe("case workflow", () => {
  it("requests a bill, waits for delivery, then pauses for authorization", async () => {
    const initial = createCase(demoTransaction);
    const provider = new MockCommunicationProvider(0);
    const waiting = await investigateCase(initial, new MockMedicalRecordProvider(), provider);
    expect(waiting.status).toBe("WAITING_FOR_BILL");
    expect(waiting.bill).toBeNull();
    expect(waiting.timeline.map((event) => event.title)).toContain("Itemized bill requested");
    const result = await analyzeCase(waiting, provider);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.timeline.map((event) => event.title)).toContain("Itemized bill received");
    expect(result.findings.filter((finding) => finding.action === "REQUEST_REVIEW")).toHaveLength(1);
    expect(result.resolution).toBeNull();
    expect(result.auditLog.map((entry) => entry.tool)).toContain("getMedicalRecords");
    expect(result.auditLog.map((entry) => entry.tool)).toContain("requestItemizedBill");
    expect(result.auditLog.map((entry) => entry.tool)).toContain("parseItemizedBill");
  });

  it("keeps the case waiting when the bill has not arrived", async () => {
    const provider = new MockCommunicationProvider(60_000);
    const waiting = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider);
    const stillWaiting = await analyzeCase(waiting, provider);
    expect(stillWaiting.status).toBe("WAITING_FOR_BILL");
    expect(stillWaiting.bill).toBeNull();
  });

  it("requires explicit authorization for provider contact", async () => {
    const provider = new MockCommunicationProvider(0);
    const investigated = await analyzeCase(await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider), provider);
    await expect(reviewCase(investigated, new MockCommunicationProvider(), false)).rejects.toThrow(/authorization/i);
    expect(investigated.communications.filter((item) => item.type === "BILLING_REVIEW")).toHaveLength(0);
  });

  it("does not reuse the University Hospital fixture for a different provider", async () => {
    const other = createCase({ id: "other-1", merchant: "Other Hospital", amount: 250, date: "2026-09-28", category: "healthcare" });
    await expect(investigateCase(other, new MockMedicalRecordProvider(), new MockCommunicationProvider())).rejects.toThrow(/demo fixture/i);
  });

  it("tags a failed provider contact as ambiguous, distinct from a plain record-read failure", async () => {
    const wrongProviderName = { ...createCase(demoTransaction), provider: { name: "Other Hospital" } };
    await expect(investigateCase(wrongProviderName, new MockMedicalRecordProvider(), new MockCommunicationProvider())).rejects.toBeInstanceOf(ContactAmbiguousError);
    const other = createCase({ id: "other-1", merchant: "Other Hospital", amount: 250, date: "2026-09-28", category: "healthcare" });
    let readError: unknown;
    try { await investigateCase(other, new MockMedicalRecordProvider(), new MockCommunicationProvider()); }
    catch (error) { readError = error; }
    expect(readError).not.toBeInstanceOf(ContactAmbiguousError);
    expect(readError).toBeInstanceOf(Error);
  });

  it("records provider confirmation before reporting savings", async () => {
    const provider = new MockCommunicationProvider(0);
    const investigated = await analyzeCase(await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider), provider);
    const reviewed = await reviewCase(investigated, new MockCommunicationProvider(), true);
    expect(reviewed.resolution?.result).toBe("DUPLICATE_REMOVED");
    expect(reviewed.resolution?.adjustment).toBe(700);
    expect(reviewed.resolution?.explanation).toMatch(/emergency room charge/i);
    expect(reviewed.status).toBe("RESOLVED");
    expect(reviewed.recovery?.status).toBe("REFUND_PENDING");
    expect(reviewed.timeline.find((event) => event.title === "You authorized billing review")?.status).toBe("complete");
    const notified = await notifyCase(reviewed, new MockCommunicationProvider());
    expect(notified.status).toBe("USER_NOTIFIED");
    expect(notified.summary).toMatch(/\$700/);
    expect(notified.summary).toMatch(/money has not been received/i);
    const received = receiveDemoRefund(notified);
    expect(received.recovery?.status).toBe("REFUND_RECEIVED");
    expect(received.recovery?.creditTransactionId).toBe("demo-credit-700");
    expect(receiveDemoRefund(received).auditLog).toHaveLength(received.auditLog.length);
    expect(notified.recovery?.status).toBe("REFUND_PENDING");
  });

  it("cannot record a refund before provider confirmation or for a different payment", async () => {
    expect(() => receiveDemoRefund(createCase(demoTransaction))).toThrow(/awaiting a refund/i);
    const provider = new MockCommunicationProvider(0);
    const analyzed = await analyzeCase(await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider), provider);
    const notified = await notifyCase(await reviewCase(analyzed, provider, true), provider);
    notified.transaction = { ...notified.transaction, id: "unrelated-payment", merchant: "Unrelated Clinic" };
    expect(() => receiveDemoRefund(notified)).toThrow(/seeded payment/i);
  });

  it("rejects a mismatched inbound statement and an inconsistent correction", async () => {
    const provider = new MockCommunicationProvider(0);
    const waiting = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider);
    expect(() => receiveItemizedStatement(waiting, demoStatement.replace("Provider: University Hospital", "Provider: Other Hospital"))).toThrow(/provider does not match/i);
    const modified = demoStatement.replace("Total: 4820.00", "Total: 4821.00");
    const analyzed = receiveItemizedStatement(waiting, modified);
    await expect(reviewCase(analyzed, provider, true)).rejects.toThrow(/does not reconcile/i);
    expect(analyzed.resolution).toBeNull();
  });

  it("does not promise a gross-charge correction as an insured patient's refund", async () => {
    const provider = new MockCommunicationProvider(0);
    const analyzed = await analyzeCase(await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider), provider);
    analyzed.insurance = { coverage: "INSURED", network: "IN_NETWORK", claimStatus: "FINAL", payer: "Synthetic insurer", plan: "Synthetic plan" };
    const reviewed = await reviewCase(analyzed, provider, true);
    expect(reviewed.resolution?.adjustment).toBe(700);
    expect(reviewed.recovery).toBeUndefined();
    expect(reviewed.financialReview?.status).toBe("REPROCESSING_REQUIRED");
    const notified = await notifyCase(reviewed, provider);
    expect(notified.summary).toMatch(/refund is not yet known/i);
    expect(() => receiveDemoRefund(notified)).toThrow(/awaiting a refund/i);
    expect(notified.communications.find((entry) => entry.type === "BILLING_REVIEW")?.transcript).toMatch(/refund amount is not confirmed/i);
  });
});

describe("authorized hospital call checkpoint", () => {
  const fishLike = (calls: { count: number }) => {
    const base = new MockCommunicationProvider(Number.POSITIVE_INFINITY);
    return Object.assign(Object.create(base), {
      requiresCallAuthorization: true,
      async requestItemizedBill(context: { providerName: string }) { calls.count += 1; return { ...(await base.requestItemizedBill(context)), result: "Fish call queued · session sess-9" }; },
    }) as MockCommunicationProvider & { requiresCallAuthorization: true };
  };

  it("stops at REQUESTING_BILL without contacting the provider when a call needs authorization", async () => {
    const calls = { count: 0 };
    const paused = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), fishLike(calls));
    expect(paused.status).toBe("REQUESTING_BILL");
    expect(calls.count).toBe(0);
    expect(paused.communications).toHaveLength(0);
    expect(paused.timeline.at(-1)).toMatchObject({ title: "Ready to call hospital billing", status: "attention" });
  });

  it("places the call only with authorization, records the session, and waits for the bill", async () => {
    const calls = { count: 0 };
    const provider = fishLike(calls);
    const paused = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider);
    await expect(requestItemizedBill(paused, provider, false)).rejects.toThrow(/authorization/i);
    expect(calls.count).toBe(0);
    const waiting = await requestItemizedBill(paused, provider, true);
    expect(calls.count).toBe(1);
    expect(waiting.status).toBe("WAITING_FOR_BILL");
    expect(waiting.communications).toHaveLength(1);
    expect(waiting.communications[0]).toMatchObject({ type: "ITEMIZED_BILL_REQUEST", status: "PENDING", result: "Fish call queued · session sess-9" });
    expect(waiting.auditLog.at(-1)).toMatchObject({ tool: "requestItemizedBill", outputSummary: "Fish call queued · session sess-9" });
    expect(waiting.timeline.map((event) => event.title)).toContain("You authorized the hospital call");
  });

  it("refuses a second call from a waiting case or a case that already has a request", async () => {
    const calls = { count: 0 };
    const provider = fishLike(calls);
    const waiting = await requestItemizedBill(await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider), provider, true);
    await expect(requestItemizedBill(waiting, provider, true)).rejects.toThrow(/not ready/i);
    const forced = { ...waiting, status: "REQUESTING_BILL" as const };
    await expect(requestItemizedBill(forced, provider, true)).rejects.toThrow(/already exists/i);
    expect(calls.count).toBe(1);
  });

  it("leaves the case at REQUESTING_BILL when the call fails", async () => {
    const provider = Object.assign(Object.create(new MockCommunicationProvider()), { requiresCallAuthorization: true, requestItemizedBill: async () => { throw new Error("boom"); } }) as MockCommunicationProvider;
    const paused = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider);
    await expect(requestItemizedBill(paused, provider, true)).rejects.toThrow("boom");
    expect(paused.status).toBe("REQUESTING_BILL");
    expect(paused.communications).toHaveLength(0);
  });

  it("keeps the existing mock flow when no authorization is needed", async () => {
    const waiting = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), new MockCommunicationProvider(0));
    expect(waiting.status).toBe("WAITING_FOR_BILL");
    expect(waiting.communications).toHaveLength(1);
  });
});
