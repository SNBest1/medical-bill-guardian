import { describe, expect, it, vi } from "vitest";
import { FishCallError, FishConfigError, FishDemoCommunicationProvider, fishCallIdempotencyKey, fishErrorMessage, type FishDemoConfig } from "./fish-demo";

const config: FishDemoConfig = {
  apiKey: "fish-secret",
  agentId: "agent-1",
  phoneNumberId: "phone-1",
  toNumber: "+15555550100",
  hospitalPhone: "+15555550100",
  guardianLine: "+15555550142",
};
const ctx = { caseId: "CASE-1", attemptId: "run-a", providerName: "Northstar Health System", scenarioId: "morgan-wellness" };

const response = (body: unknown, status: number) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = () => vi.fn<typeof fetch>().mockResolvedValue(response({ session_id: "sess-1", status: "queued" }, 201));

describe("FishDemoCommunicationProvider", () => {
  it("queues one call with the documented body, dynamic variables, and idempotency header", async () => {
    const fetcher = ok();
    const result = await new FishDemoCommunicationProvider(config, fetcher).requestItemizedBill(ctx);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.fish.audio/v1/agent/phone-calls");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Authorization: "Bearer fish-secret", "Content-Type": "application/json", "Idempotency-Key": fishCallIdempotencyKey("CASE-1", "run-a", "+15555550100") });
    expect(JSON.parse(String(init?.body))).toEqual({
      agent_id: "agent-1",
      phone_number_id: "phone-1",
      to_number: "+15555550100",
      dynamic_variables: {
        receipt_case_id: "CASE-1",
        receipt_attempt_id: "run-a",
        patient_name: "Morgan Rivera",
        hospital_name: "Northstar Health System",
        payment_amount: "1,102 dollars",
        payment_date: "July 18th",
        service_date: "July 18th",
        guardian_line: "+15555550142",
        guardian_line_spoken: "+1; 5 5 5; 5 5 5; 0 1 4 2",
      },
    });
    expect(result.status).toBe("PENDING");
    expect(result.type).toBe("ITEMIZED_BILL_REQUEST");
    expect(result.result).toBe("Fish call queued · session sess-1");
    expect(result.transcript).toContain("ending 0100");
    expect(result.transcript).not.toContain("+15555550100");
  });

  it("never sends the invoice number or the flagged charge, which are unknown before the bill", async () => {
    const fetcher = ok();
    await new FishDemoCommunicationProvider(config, fetcher).requestItemizedBill(ctx);
    const body = String(fetcher.mock.calls[0][1]?.body);
    expect(body).not.toMatch(/invoice|NS-71802|electrocardiogram/i);
  });

  it("builds variables per patient from the case's scenario", async () => {
    const fetcher = ok();
    await new FishDemoCommunicationProvider(config, fetcher).requestItemizedBill({ ...ctx, scenarioId: "harriet-kidney" });
    const vars = JSON.parse(String(fetcher.mock.calls[0][1]?.body)).dynamic_variables;
    expect(vars.patient_name).toMatch(/^Harriet /);
    expect(vars).toMatchObject({ hospital_name: "Northstar Health System", payment_amount: "964 dollars", payment_date: "January 20th" });
  });

  it("scopes the idempotency key to run and destination without exposing digits", () => {
    const a = fishCallIdempotencyKey("CASE-1", "run-a", "+15555550100");
    expect(a).toBe(fishCallIdempotencyKey("CASE-1", "run-a", " +15555550100 "));
    expect(a).not.toBe(fishCallIdempotencyKey("CASE-1", "run-b", "+15555550100"));
    expect(a).not.toBe(fishCallIdempotencyKey("CASE-1", "run-a", "+15555550101"));
    expect(a).not.toContain("0100");
  });

  it("refuses a destination that is not DEMO_HOSPITAL_PHONE, before any request", async () => {
    const fetcher = ok();
    const error = await new FishDemoCommunicationProvider({ ...config, hospitalPhone: "+15555550111" }, fetcher).requestItemizedBill(ctx).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(FishConfigError);
    expect(String(error)).toContain("must equal DEMO_HOSPITAL_PHONE");
    expect(String(error)).not.toContain("5555550");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["missing DEMO_HOSPITAL_PHONE", { hospitalPhone: "" }, "DEMO_HOSPITAL_PHONE"],
    ["non-E.164 destination", { toNumber: "555-0100", hospitalPhone: "555-0100" }, "E.164"],
    ["missing agent", { agentId: "" }, "FISH_AGENT_ID"],
    ["missing guardian line", { guardianLine: "" }, "SPECTRUM_HOSPITAL_ASSIGNED_LINE"],
    ["invalid guardian line", { guardianLine: "415" }, "SPECTRUM_HOSPITAL_ASSIGNED_LINE"],
  ])("rejects %s without calling Fish or leaking values", async (_name, override, expected) => {
    const fetcher = ok();
    const error = await new FishDemoCommunicationProvider({ ...config, ...override }, fetcher).requestItemizedBill(ctx).catch((cause: unknown) => cause);
    expect(String(error)).toContain(expected);
    expect(String(error)).not.toContain("fish-secret");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("raises a typed, redacted error for a non-201 response and never puts the body in the message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ error: "bad fish-secret to +15555550100 from +15555550142" }, 422));
    const error = await new FishDemoCommunicationProvider(config, fetcher).requestItemizedBill(ctx).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(FishCallError);
    expect(error).toMatchObject({ status: 422 });
    const body = (error as FishCallError).responseBody;
    expect(body).toContain("[REDACTED]");
    for (const secret of ["fish-secret", "+15555550100", "+15555550142"]) expect(body).not.toContain(secret);
    expect(String(error)).not.toContain("bad");
  });

  it("rejects a 201 without a session id", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ status: "queued" }, 201));
    await expect(new FishDemoCommunicationProvider(config, fetcher).requestItemizedBill(ctx)).rejects.toMatchObject({ status: 201 });
  });

  it("redacts the key and numbers from a network failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("connect fish-secret +15555550100 failed"));
    const error = await new FishDemoCommunicationProvider(config, fetcher).requestItemizedBill(ctx).catch((cause: unknown) => cause);
    expect(String(error)).not.toContain("fish-secret");
    expect(String(error)).not.toContain("+15555550100");
    expect(String(error)).toMatch(/no duplicate|will not place a duplicate/i);
  });

  it("gives every Fish status a safe message", () => {
    for (const status of [401, 402, 403, 404, 409, 422, 429, 500, 503, 418]) expect(fishErrorMessage(status)).toMatch(/\w/);
    expect(fishErrorMessage(503)).toMatch(/duplicate/);
  });

  it("does not fabricate a statement from the call: the manual fallback never delivers", async () => {
    const provider = new FishDemoCommunicationProvider(config, ok());
    const request = await provider.requestItemizedBill(ctx);
    expect(provider.requiresCallAuthorization).toBe(true);
    await expect(provider.getItemizedBill(ctx.providerName, { ...request, timestamp: "2020-01-01T00:00:00Z" }, ctx.scenarioId)).resolves.toBeNull();
  });
});
