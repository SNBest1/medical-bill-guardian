import { describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { parsePhotonStatement } from "./photon-inbox";
import { parseLocalPhotonMessage } from "./photon-receiver";

const phone = "+15555550123";
const text = "Case: CASE-4821\nSynthetic demo statement\nInvoice: UH-48291\nProvider: University Hospital\nService date: 2026-09-28\nCharges\nER visit | 99285 | 1200.00\nTotal: 1200.00";
const message = (overrides: Partial<{ id: string; direction: string; platform: string; senderId: string; contentType: string; text: string }> = {}) => ({
  id: overrides.id ?? "local-message-1",
  direction: overrides.direction ?? "inbound",
  platform: overrides.platform ?? "iMessage",
  sender: { id: overrides.senderId ?? phone },
  content: { type: overrides.contentType ?? "text", text: overrides.text ?? text },
});
const space = (overrides: Partial<{ platform: string; type: string }> = {}) => ({ __platform: overrides.platform ?? "iMessage", type: overrides.type ?? "dm" });

describe("local Photon SDK receiver", () => {
  it("accepts the hospital's synthetic statement from the live SDK message shape", () => {
    const entry = parseLocalPhotonMessage(space(), message(), phone);
    expect(entry).toEqual({ messageId: "local-message-1", sender: phone, caseId: "CASE-4821", statement: text.split("\n").slice(2).join("\n") });
  });

  it("rejects non-hospital senders, group chats, non-iMessage platforms, and unlabelled text", () => {
    expect(parseLocalPhotonMessage(space(), message({ senderId: "+15555550124" }), phone)).toBeNull();
    expect(parseLocalPhotonMessage(space({ type: "group" }), message(), phone)).toBeNull();
    expect(parseLocalPhotonMessage(space({ platform: "telegram" }), message(), phone)).toBeNull();
    expect(parseLocalPhotonMessage(space(), message({ platform: "telegram" }), phone)).toBeNull();
    expect(parseLocalPhotonMessage(space(), message({ text: "just chatting" }), phone)).toBeNull();
    expect(parseLocalPhotonMessage(space(), message({ contentType: "attachment" }), phone)).toBeNull();
    expect(parseLocalPhotonMessage(space(), message({ direction: "outbound" }), phone)).toBeNull();
  });

  it("throws rather than silently accepting a missing message ID or an oversized statement", () => {
    expect(() => parseLocalPhotonMessage(space(), { ...message(), id: "" }, phone)).toThrow("Missing message ID");
    expect(() => parseLocalPhotonMessage(space(), message({ text: "x".repeat(70000) }), phone)).toThrow("Statement too large");
  });

  it("dedupes against the webhook transport through the same durable inbox and message ID", () => {
    const store = new CaseStore(":memory:");
    try {
      const webhookPayload = { event: "messages", space: { platform: "iMessage", type: "dm" }, message: { id: "shared-id", platform: "iMessage", direction: "inbound", sender: { id: phone }, content: { type: "text", text } } };
      const fromWebhook = parsePhotonStatement(webhookPayload, phone)!;
      const fromReceiver = parseLocalPhotonMessage(space(), message({ id: "shared-id" }), phone)!;
      expect(fromWebhook.messageId).toBe(fromReceiver.messageId);
      expect(store.enqueueStatement(fromWebhook)).toBe(true);
      expect(store.enqueueStatement(fromReceiver)).toBe(false);
    } finally { store.close(); }
  });
});
