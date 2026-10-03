import { describe, expect, it } from "vitest";
import { createCase, investigateCase, reviewCase, notifyCase } from "./orchestrator";
import { demoTransaction } from "../demo";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";

describe("case workflow", () => {
  it("investigates a payment and pauses for authorization", async () => {
    const initial = createCase(demoTransaction);
    const result = await investigateCase(initial, new MockMedicalRecordProvider(), new MockCommunicationProvider());
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.findings.filter((finding) => finding.action === "REQUEST_REVIEW")).toHaveLength(1);
    expect(result.resolution).toBeNull();
    expect(result.auditLog.map((entry) => entry.tool)).toContain("getMedicalRecords");
    expect(result.auditLog.map((entry) => entry.tool)).toContain("requestItemizedBill");
  });

  it("requires explicit authorization for provider contact", async () => {
    const investigated = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), new MockCommunicationProvider());
    await expect(reviewCase(investigated, new MockCommunicationProvider(), false)).rejects.toThrow(/authorization/i);
    expect(investigated.communications.filter((item) => item.type === "BILLING_REVIEW")).toHaveLength(0);
  });

  it("does not reuse the University Hospital fixture for a different provider", async () => {
    const other = createCase({ id: "other-1", merchant: "Other Hospital", amount: 250, date: "2026-09-28", category: "healthcare" });
    await expect(investigateCase(other, new MockMedicalRecordProvider(), new MockCommunicationProvider())).rejects.toThrow(/demo fixture/i);
  });

  it("records provider confirmation before reporting savings", async () => {
    const investigated = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), new MockCommunicationProvider());
    const reviewed = await reviewCase(investigated, new MockCommunicationProvider(), true);
    expect(reviewed.resolution?.result).toBe("DUPLICATE_REMOVED");
    expect(reviewed.resolution?.adjustment).toBe(700);
    expect(reviewed.status).toBe("RESOLVED");
    expect(reviewed.timeline.find((event) => event.title === "You authorized billing review")?.status).toBe("complete");
    const notified = await notifyCase(reviewed, new MockCommunicationProvider());
    expect(notified.status).toBe("USER_NOTIFIED");
    expect(notified.summary).toMatch(/\$700/);
  });
});
