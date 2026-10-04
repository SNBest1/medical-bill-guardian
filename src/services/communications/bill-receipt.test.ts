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
  it("distinguishes arrival, processing, success, and failure", () => {
    expect(check().status).toBe("waiting");
    const reading = { messageId: "text", startedAt: new Date().toISOString(), done: false, failed: false, steps: [{ id: "step", at: "now", kind: "received" as const, text: "Text received" }] };
    expect(check({ ...c, reading }).status).toBe("processing");
    expect(check({ ...c, reading: { ...reading, failed: true } }).status).toBe("failed");
    expect(check({ ...c, reading: { ...reading, done: true }, bill: { invoiceId: "inv", provider: "Hospital", items: [], total: 20 } }).status).toBe("received");
  });
});
