import { describe, expect, it, vi } from "vitest";
import { draftProviderEmail, sendProviderEmail } from "./resend";
import type { Env } from "./types";

const input = { caseId: "42", kind: "EMAIL_ITEMIZED_BILL_REQUEST" as const, merchant: "University Hospital", paidOn: "2026-09-28" };

describe("Resend provider request", () => {
  it("never sends until explicitly enabled and configured", async () => {
    const fetcher = vi.fn();
    await expect(sendProviderEmail({ EMAIL_SEND_ENABLED: "false" } as Env, input, fetcher)).rejects.toThrow("not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the fixed test recipient, reply address, and stable idempotency key", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "resend-42" }), { status: 200 }));
    const env = { EMAIL_SEND_ENABLED: "true", RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "billing@nipunsaini.com" } as Env;
    expect(await sendProviderEmail(env, input, fetcher)).toBe("resend-42");
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ "Idempotency-Key": "medical-bill-guardian/42/EMAIL_ITEMIZED_BILL_REQUEST" });
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ["nipun.saini9@gmail.com"], reply_to: "ai@nipunsaini.com" });
  });

  it("identifies itself with a User-Agent, which Cloudflare's bot filter (error 1010) requires", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "resend-42" }), { status: 200 }));
    await sendProviderEmail({ EMAIL_SEND_ENABLED: "true", RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "billing@nipunsaini.com" } as Env, input, fetcher);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^medical-bill-guardian\//);
  });

  it("reports Resend's own error message", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "The billing@nipunsaini.com domain is not verified" }), { status: 403 }));
    await expect(sendProviderEmail({ EMAIL_SEND_ENABLED: "true", RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "billing@nipunsaini.com" } as Env, input, fetcher)).rejects.toThrow("Resend send failed (403): The billing@nipunsaini.com domain is not verified");
  });

  it("states missing medical evidence cautiously", () => {
    const draft = draftProviderEmail({ ...input, kind: "EMAIL_BILLING_REVIEW", questionedCharge: "specialist consultation" });
    expect(draft.text).toContain("did not verify");
    expect(draft.text).toContain("does not assert that the charge is invalid");
  });
});
