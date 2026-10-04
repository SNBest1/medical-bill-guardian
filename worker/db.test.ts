import { describe, expect, it, vi } from "vitest";
import { callReducer, sqlRows } from "./db";
import type { Env } from "./types";

const env = { SPACETIME_HTTP_URL: "https://maincloud.spacetimedb.com", SPACETIME_DB_NAME: "guardian-test", SPACETIME_OWNER_TOKEN: "private-test-token" } as Env;

describe("trusted SpacetimeDB bridge", () => {
  it("decodes SQL product rows and sends owner authorization only server-side", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ schema: { elements: [{ name: { some: "case_id" } }, { name: { some: "kind" } }] }, rows: [["42", "EMAIL_BILLING_REVIEW"]] }]), { status: 200 }));
    expect(await sqlRows(env, "SELECT * FROM communication", fetcher)).toEqual([{ caseId: "42", kind: "EMAIL_BILLING_REVIEW" }]);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer private-test-token" });
  });

  it("calls only the named reducer with positional JSON arguments", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    await callReducer(env, "record_outbound_email", ["42", "EMAIL_BILLING_REVIEW", "resend-123"], fetcher);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://maincloud.spacetimedb.com/v1/database/guardian-test/call/record_outbound_email");
    expect(JSON.parse(String(init.body))).toEqual(["42", "EMAIL_BILLING_REVIEW", "resend-123"]);
  });
});
