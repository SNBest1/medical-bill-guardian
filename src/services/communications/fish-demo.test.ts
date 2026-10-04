import { describe, expect, it, vi } from "vitest";
import { FishCallError, FishDemoCommunicationProvider, type FishDemoConfig } from "./fish-demo";

const config: FishDemoConfig = {
  apiKey: "fish-secret",
  agentId: "agent-1",
  phoneNumberId: "phone-1",
  toNumber: "+13135550199",
};

const response = (body: unknown, status: number) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("FishDemoCommunicationProvider", () => {
  it("queues an outbound call with the documented payload and stable case idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ session_id: "session-1", status: "queued" }, 201));
    const provider = new FishDemoCommunicationProvider(config, fetcher);

    const result = await provider.requestItemizedBill({ caseId: "CASE-4821", providerName: "University Hospital" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.fish.audio/v1/agent/phone-calls",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer fish-secret",
          "Content-Type": "application/json",
          "Idempotency-Key": "medical-bill-guardian:CASE-4821:request-itemized-bill",
        }),
        body: JSON.stringify({
          agent_id: "agent-1",
          phone_number_id: "phone-1",
          to_number: "+13135550199",
        }),
      }),
    );
    expect(result.status).toBe("PENDING");
    expect(result.result).toContain("session-1");
    expect(result.transcript).toContain("ending 0199");
  });

  it("propagates a safe non-201 response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({ error: `invalid fish-secret destination ${config.toNumber}` }, 422),
    );
    const provider = new FishDemoCommunicationProvider(config, fetcher);

    const error = await provider
      .requestItemizedBill({ caseId: "CASE-4821", providerName: "University Hospital" })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(FishCallError);
    expect(error).toMatchObject({ status: 422 });
    expect((error as FishCallError).responseBody).toContain("[REDACTED]");
    expect(String(error)).not.toContain("fish-secret");
    expect(String(error)).not.toContain(config.toNumber);
  });

  it("rejects a 201 response without a session id", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ status: "queued" }, 201));
    const provider = new FishDemoCommunicationProvider(config, fetcher);

    await expect(
      provider.requestItemizedBill({ caseId: "CASE-4821", providerName: "University Hospital" }),
    ).rejects.toMatchObject({ status: 201 });
  });

  it("rejects a non-E.164 destination before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new FishDemoCommunicationProvider({ ...config, toNumber: "313-555-0199" }, fetcher);

    const error = await provider
      .requestItemizedBill({ caseId: "CASE-4821", providerName: "University Hospital" })
      .catch((cause: unknown) => cause);

    expect(fetcher).not.toHaveBeenCalled();
    expect(String(error)).not.toContain("313-555-0199");
    expect(String(error)).toMatch(/E\.164/);
  });

  it("reports missing configuration without exposing configured secrets", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new FishDemoCommunicationProvider({ ...config, agentId: "" }, fetcher);

    await expect(
      provider.requestItemizedBill({ caseId: "CASE-4821", providerName: "University Hospital" }),
    ).rejects.toThrow("FISH_AGENT_ID");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
