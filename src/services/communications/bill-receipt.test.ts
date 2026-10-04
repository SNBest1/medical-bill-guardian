import { describe, expect, it } from "vitest";
import { billReceipt } from "./bill-receipt";
import { createCase } from "../agent/orchestrator";
const c = createCase({ id: "test", merchant: "Hospital", amount: 20, date: "2026-09-28" });
const check = (value = c) => billReceipt(value, c.id, c.auditLog[0].id);
describe("call PDF receipt", () => {
  it("rejects previous runs and other patients", () => {
    expect(billReceipt(c, c.id, "old-run").status).toBe("unavailable");
    expect(billReceipt(c, "other-case", c.auditLog[0].id).status).toBe("unavailable");
  });
  it("tells the caller which patient mismatched instead of claiming the PDF was unreadable", () => {
    const receipt = check({ ...c, scenarioId: "morgan-wellness", reading: { startedAt: "now", done: true, failed: true, steps: [
      { id: "patient", at: "now", kind: "patient", text: "Patient: Harriet Lindqvist" },
      { id: "error", at: "now", kind: "error", text: "This bill names Harriet Lindqvist, who does not match any case waiting at Northstar Health System, so it was not applied" },
    ] } });
    expect(receipt.message).toContain("PDF was successfully read");
    expect(receipt.message).toContain("names Harriet Lindqvist");
    expect(receipt.message).toContain("investigation is for Morgan Rivera");
  });
  it("passes the specific download failure to the caller", () => {
    const receipt = check({ ...c, reading: { startedAt: "now", done: true, failed: true, steps: [
      { id: "error", at: "now", kind: "error", text: "Could not download the bill", detail: "The link expired" },
    ] } });
    expect(receipt.message).toContain("Could not download the bill: The link expired");
  });
  it("distinguishes arrival, processing, success, and failure", () => {
    expect(check().status).toBe("waiting");
    const reading = { messageId: "text", startedAt: new Date().toISOString(), done: false, failed: false, steps: [{ id: "step", at: "now", kind: "received" as const, text: "Text received" }] };
    expect(check({ ...c, reading }).status).toBe("processing");
    expect(check({ ...c, reading: { ...reading, failed: true } }).status).toBe("failed");
    expect(check({ ...c, reading: { ...reading, done: true }, bill: { invoiceId: "inv", provider: "Hospital", items: [], total: 20 } }).status).toBe("received");
  });
});
