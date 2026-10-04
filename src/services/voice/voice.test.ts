import { describe, expect, it, vi } from "vitest";
import { approvedVoiceTarget } from "./approved-target";
import { classifyCallOutcome } from "./outcome";
import { elevenLabsConfig, placeOutboundCall } from "./elevenlabs";

const config = { apiKey: "test-key", agentId: "agent-1", agentPhoneNumberId: "phone-1" };

describe("approvedVoiceTarget", () => {
  it("returns the approved synthetic hospital phone", () => {
    expect(approvedVoiceTarget("University Hospital", { DEMO_HOSPITAL_PHONE: "+15555550123" })).toEqual({ providerName: "University Hospital", phone: "+15555550123" });
  });

  it("refuses any other provider", () => {
    expect(() => approvedVoiceTarget("Other Hospital", { DEMO_HOSPITAL_PHONE: "+15555550123" })).toThrow("approved University Hospital");
  });

  it("refuses a malformed phone number", () => {
    expect(() => approvedVoiceTarget("University Hospital", { DEMO_HOSPITAL_PHONE: "555-0123" })).toThrow("E.164");
  });
});

describe("placeOutboundCall", () => {
  it("refuses to dial without explicit authorization", async () => {
    const fetchImpl = vi.fn();
    await expect(placeOutboundCall({ toNumber: "+15555550123", dialAuthorized: false }, config, fetchImpl as unknown as typeof fetch)).rejects.toThrow("explicit rehearsal authorization");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the agent, phone id, and destination when authorized", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, message: "ok", conversation_id: "c1", callSid: "s1" }), { status: 200 }));
    const result = await placeOutboundCall({ toNumber: "+15555550123", dialAuthorized: true }, config, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ conversationId: "c1", callSid: "s1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/twilio/outbound-call");
    expect(JSON.parse(String(init.body))).toEqual({ agent_id: "agent-1", agent_phone_number_id: "phone-1", to_number: "+15555550123" });
  });

  it("reports a failed request without a result", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 422 }));
    await expect(placeOutboundCall({ toNumber: "+15555550123", dialAuthorized: true }, config, fetchImpl as unknown as typeof fetch)).rejects.toThrow("status 422");
  });
});

describe("elevenLabsConfig", () => {
  it("fails closed when keys are missing", () => {
    expect(() => elevenLabsConfig({})).toThrow("not configured");
  });
});

describe("classifyCallOutcome", () => {
  it("does not confirm a connected call with no billing-side confirmation", () => {
    expect(classifyCallOutcome([{ role: "agent", message: "Hello, this is the billing assistant." }, { role: "user", message: "Hello." }])).toBe("NOT_CONFIRMED");
  });

  it("confirms only when the billing side confirms removing the charge", () => {
    expect(classifyCallOutcome([
      { role: "agent", message: "Which charge should we verify?" },
      { role: "user", message: "That consultation duplicated services. We will remove the seven hundred dollars." },
    ])).toBe("CONFIRMED");
  });

  it("ignores the agent repeating the confirmation itself", () => {
    expect(classifyCallOutcome([{ role: "agent", message: "We will remove the seven hundred dollars, correct?" }])).toBe("NOT_CONFIRMED");
  });
});
