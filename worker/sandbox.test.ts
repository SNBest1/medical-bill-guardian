import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSandboxDiscover } from "./sandbox";
import type { Env } from "./types";

const identity = "a".repeat(64);
const env: Env = {
  ASSETS: { fetch: async () => new Response() },
  SPACETIME_HTTP_URL: "https://db.example.test",
  SPACETIME_DB_NAME: "guardian",
  SPACETIME_OWNER_TOKEN: "publisher-token",
};

afterEach(() => vi.unstubAllGlobals());

describe("sandbox discovery bridge", () => {
  it("rejects an unauthenticated import", async () => {
    const response = await handleSandboxDiscover(new Request("https://app.example.test/api/sandbox/discover", {
      method: "POST", body: JSON.stringify({ ownerIdentity: identity }),
    }), env);
    expect(response.status).toBe(401);
  });

  it("checks the browser token against the claimed identity", async () => {
    const remote = vi.fn(async () => new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", remote);
    const response = await handleSandboxDiscover(new Request("https://app.example.test/api/sandbox/discover", {
      method: "POST", headers: { authorization: "Bearer browser-token" }, body: JSON.stringify({ ownerIdentity: identity }),
    }), env);
    expect(response.status).toBe(401);
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("uses the caller's identity for the labeled mock fallback", async () => {
    const remote = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/identity/${identity}/verify`)) return new Response(null, { status: 204 });
      if (url.endsWith("/call/scan_demo_payment")) {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer browser-token" });
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", remote);
    const response = await handleSandboxDiscover(new Request("https://app.example.test/api/sandbox/discover", {
      method: "POST", headers: { authorization: "Bearer browser-token" }, body: JSON.stringify({ ownerIdentity: identity }),
    }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transactionSource: "MOCK", recordsSource: "MOCK" });
  });

  it("serializes a verified owner identity in SpacetimeDB's 256-bit JSON format", async () => {
    const remote = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/identity/${identity}/verify`)) return new Response(null, { status: 204 });
      if (url.includes("/customers/c1/accounts")) return Response.json([{ _id: "a1" }]);
      if (url.includes("/accounts/a1/purchases")) return Response.json([{ _id: "p1", merchant_id: "m1", amount: 4820, purchase_date: "2026-09-28" }]);
      if (url.includes("/merchants/m1")) return Response.json({ name: "University Hospital", category: "healthcare" });
      if (url.endsWith("/call/ingest_external_case")) {
        expect(JSON.parse(String(init?.body))[0]).toEqual({ __identity__: `0x${identity}` });
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", remote);
    const response = await handleSandboxDiscover(new Request("https://app.example.test/api/sandbox/discover", {
      method: "POST", headers: { authorization: "Bearer browser-token" }, body: JSON.stringify({ ownerIdentity: identity }),
    }), { ...env, NESSIE_API_KEY: "test", NESSIE_CUSTOMER_ID: "c1", NESSIE_BASE_URL: "https://nessie.test" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transactionSource: "NESSIE_SANDBOX", recordsSource: "NONE" });
  });
});
