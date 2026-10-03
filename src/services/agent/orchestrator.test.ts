import { describe, expect, it } from "vitest";
import { createCase, investigateCase, analyzeCase, reviewCase, notifyCase } from "./orchestrator";
import { demoTransaction } from "../demo";
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

  it("records provider confirmation before reporting savings", async () => {
    const provider = new MockCommunicationProvider(0);
    const investigated = await analyzeCase(await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), provider), provider);
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
