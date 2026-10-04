import { describe, expect, it } from "vitest";
import { createCase, investigateCase, requestItemizedBill, analyzeCase, reviewCase, notifyCase } from "./orchestrator";
import { demoTransaction } from "../demo";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";

describe("case workflow", () => {
  it("requests a bill, waits for delivery, then pauses for authorization", async () => {
    const initial = createCase(demoTransaction);
    const provider = new MockCommunicationProvider(0);
    const ready = await investigateCase(initial, new MockMedicalRecordProvider());
    expect(ready.status).toBe("REQUESTING_BILL");
    expect(ready.communications).toHaveLength(0);
    await expect(requestItemizedBill(ready, provider, false)).rejects.toThrow(/authorization/i);
    const waiting = await requestItemizedBill(ready, provider, true);
    expect(waiting.status).toBe("WAITING_FOR_BILL");
    expect(waiting.bill).toBeNull();
    expect(waiting.timeline.map((event) => event.title)).toContain("Hospital call queued");
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
    const ready = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider());
    const waiting = await requestItemizedBill(ready, provider, true);
    const stillWaiting = await analyzeCase(waiting, provider);
    expect(stillWaiting.status).toBe("WAITING_FOR_BILL");
    expect(stillWaiting.bill).toBeNull();
  });

  it("requires explicit authorization for provider contact", async () => {
    const provider = new MockCommunicationProvider(0);
    const ready = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider());
    const waiting = await requestItemizedBill(ready, provider, true);
    const investigated = await analyzeCase(waiting, provider);
    await expect(reviewCase(investigated, new MockCommunicationProvider(), false)).rejects.toThrow(/authorization/i);
    expect(investigated.communications.filter((item) => item.type === "BILLING_REVIEW")).toHaveLength(0);
  });

  it("does not reuse the University Hospital fixture for a different provider", async () => {
    const other = createCase({ id: "other-1", merchant: "Other Hospital", amount: 250, date: "2026-09-28", category: "healthcare" });
    const ready = await investigateCase(other, { getMedicalRecords: async () => [] });
    await expect(requestItemizedBill(ready, new MockCommunicationProvider(), true)).rejects.toThrow(/demo fixture/i);
  });

  it("rejects an itemized-bill request from the wrong state", async () => {
    const initial = createCase(demoTransaction);
    await expect(requestItemizedBill(initial, new MockCommunicationProvider(), true)).rejects.toThrow(/not ready/i);
  });

  it("rejects a duplicate itemized-bill request", async () => {
    const provider = new MockCommunicationProvider();
    const ready = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider());
    ready.communications.push(await provider.requestItemizedBill({ caseId: ready.id, attemptId: ready.auditLog[0].id, providerName: ready.provider.name }));
    await expect(requestItemizedBill(ready, provider, true)).rejects.toThrow(/already exists/i);
  });

  it("records provider confirmation before reporting savings", async () => {
    const provider = new MockCommunicationProvider(0);
    const ready = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider());
    const waiting = await requestItemizedBill(ready, provider, true);
    const investigated = await analyzeCase(waiting, provider);
    const reviewed = await reviewCase(investigated, new MockCommunicationProvider(), true);
    expect(reviewed.resolution?.result).toBe("DUPLICATE_REMOVED");
    expect(reviewed.resolution?.adjustment).toBe(700);
    expect(reviewed.resolution?.explanation).toMatch(/emergency room charge/i);
    expect(reviewed.status).toBe("RESOLVED");
    expect(reviewed.timeline.find((event) => event.title === "You authorized billing review")?.status).toBe("complete");
    const notified = await notifyCase(reviewed, new MockCommunicationProvider());
    expect(notified.status).toBe("USER_NOTIFIED");
    expect(notified.summary).toMatch(/\$700/);
  });
});
