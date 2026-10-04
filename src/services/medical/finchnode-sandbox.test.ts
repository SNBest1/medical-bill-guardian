import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinchNodeSandboxProvider, SandboxUnavailable, clearSandboxCache, matchSandboxUser, sandboxLabel } from "./finchnode-sandbox";
import { DemoMedicalProvider, FALLBACK_LABEL, FinchNodeDemoProvider, LIVE_LABEL } from "./finchnode-demo";
import { savedSnapshot } from "./finchnode-fixtures";
import { scenarios } from "../scenarios";
import { createCase, investigateCase } from "../agent/orchestrator";
import { MockCommunicationProvider } from "../communications/mock";

const KEY = "ck_test_SECRETKEY123";
const env = { FINCHNODE_API_KEY: KEY, FINCHNODE_BASE_URL: "https://api.finchnode.example/api/v1" };
const now = () => new Date("2026-10-04T12:00:00Z");
const [morgan, harriet] = scenarios;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const user = (id: string, label: string, consentedAt = "2026-10-04T02:03:27.318564+00:00") => ({ id, object: "user", consentedAt, sources: [{ system: "synthetic-test@o_1", organization: `Northstar Health System (Synthetic) · ${label}` }] });
/** What the authenticated records endpoint returns for Morgan: the saved patient's data with no sourceName on any entry, as the sandbox does. */
const sandboxRecords = () => {
  const data = structuredClone(savedSnapshot("patient-demo-001")!.data!) as Record<string, Array<Record<string, unknown>>>;
  for (const entries of Object.values(data)) if (Array.isArray(entries)) for (const entry of entries) delete entry.sourceName;
  return { object: "health_record", sources: [{ organization: "Northstar Health System (Synthetic) · Baseline adult, age 38" }], data, meta: {} };
};

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;
const router = (routes: { users?: Route; records?: Route }) => vi.fn<typeof fetch>(async (input, init) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("/users")) return (routes.users ?? (() => json({ data: [user("u_morgan", "Baseline adult, age 38")], hasMore: false })))(url, init);
  if (url.pathname.endsWith("/records")) return (routes.records ?? (() => json(sandboxRecords())))(url, init);
  return new Response("not found", { status: 404 });
});
const sandbox = (fetcher: typeof fetch, extra: Partial<ConstructorParameters<typeof FinchNodeSandboxProvider>[3]> = {}, sleep: (ms: number) => Promise<void> = async () => undefined) =>
  new FinchNodeSandboxProvider(() => env, fetcher, now, { timeoutMs: 8000, cacheTtlMs: 60_000, maxPages: 10, retryAfterCapMs: 5000, ...extra }, sleep);

beforeEach(() => clearSandboxCache());

describe("matching the sandbox patient by persona label", () => {
  const users = [user("u_old", "Baseline adult, age 38", "2026-10-01T00:00:00Z"), user("u_new", "Baseline adult, age 38", "2026-10-04T00:00:00Z"), user("u_h", "Polypharmacy, age 78")];
  it("matches the label as a whole part of the organization, newest consent first", () => {
    expect(matchSandboxUser(users, "Baseline adult, age 38")?.id).toBe("u_new");
    expect(matchSandboxUser(users, "Polypharmacy, age 78")?.id).toBe("u_h");
    expect(matchSandboxUser(users, "Pediatric asthma, age 9")).toBeUndefined();
    expect(matchSandboxUser(users, "age 38")).toBeUndefined();
    expect(matchSandboxUser([{ id: "x" }, { sources: [{ organization: "Baseline adult, age 38" }] }], "Baseline adult, age 38")).toBeUndefined();
  });
});

describe("FinchNodeSandboxProvider: authenticated pull", () => {
  it("lists users, finds Morgan by label, reads her records with the bearer key, and narrows to the encounter window", async () => {
    const fetcher = router({});
    const { records, source } = await sandbox(fetcher).retrieve(morgan.transaction);
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(["/api/v1/users", "/api/v1/users/u_morgan/records"]);
    for (const [, init] of fetcher.mock.calls) expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(source).toMatchObject({ live: true, tier: "sandbox", subject: "u_morgan", consentedAt: "2026-10-04", organization: "Northstar Health System", retrievedAt: "2026-10-04T12:00:00.000Z", label: "Retrieved live from FinchNode sandbox with patient consent (synthetic patient, consent recorded 2026-10-04)" });
    expect(sandboxLabel("2026-10-04")).toBe(source.label);
    expect(source.counts).toMatchObject({ encounters: 1, diagnosticReports: 1, labs: 6, medicationAdministrations: 1 });
    expect(records.every((record) => record.date === "2026-07-18")).toBe(true);
    expect(JSON.stringify({ records, source })).not.toContain(KEY);
  });

  it("follows the cursor through a paged user list and a paged records response", async () => {
    const users = vi.fn<Route>((url) => url.searchParams.get("cursor") ? json({ data: [user("u_morgan", "Baseline adult, age 38")], hasMore: false }) : json({ data: [user("u_other", "Something else")], hasMore: true, nextCursor: "c1" }));
    const full = sandboxRecords();
    const records = vi.fn<Route>((url) => url.searchParams.get("cursor") ? json({ data: { labs: full.data.labs }, hasMore: false }) : json({ ...full, data: { ...full.data, labs: [] }, hasMore: true, nextCursor: "r1" }));
    const { source } = await sandbox(router({ users, records })).retrieve(morgan.transaction);
    expect(users).toHaveBeenCalledTimes(2);
    expect(records).toHaveBeenCalledTimes(2);
    expect(source.counts?.labs).toBe(6);
  });

  it("remembers the patient briefly, then looks again", async () => {
    const fetcher = router({});
    const provider = sandbox(fetcher);
    await provider.retrieve(morgan.transaction);
    await provider.retrieve(morgan.transaction);
    expect(fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith("/users"))).toHaveLength(1);
    clearSandboxCache();
    await provider.retrieve(morgan.transaction);
    expect(fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith("/users"))).toHaveLength(2);
  });

  it("is unavailable, with a plain reason, when it cannot be used", async () => {
    const reason = (provider: FinchNodeSandboxProvider, transaction = morgan.transaction) => provider.retrieve(transaction).then(() => "used", (error: unknown) => (error instanceof SandboxUnavailable ? error.message : `unexpected: ${error}`));
    expect(await reason(new FinchNodeSandboxProvider(() => ({}), vi.fn()))).toMatch(/no FinchNode API key/);
    expect(await reason(new FinchNodeSandboxProvider(() => ({ FINCHNODE_API_KEY: KEY, FINCHNODE_BASE_URL: "http://insecure.example" }), vi.fn()))).toMatch(/https/);
    expect(await reason(sandbox(router({ users: () => json({ data: [user("u_h", "Polypharmacy, age 78")], hasMore: false }) })))).toMatch(/not appeared yet.*still syncing/);
    expect(await reason(sandbox(router({ records: () => json({ ...sandboxRecords(), data: { labs: sandboxRecords().data.labs } }) })))).toMatch(/no encounter for this visit/);
    expect(await reason(sandbox(router({})), scenarios[2].transaction)).toMatch(/not appeared yet/);
  });

  it.each([
    [401, /rejected the API key/], [403, /consent does not allow/], [404, /no longer exists/], [410, /no longer active/], [500, /sandbox error \(HTTP 500\)/], [503, /sandbox error \(HTTP 503\)/], [418, /refused.*HTTP 418/]
  ])("maps HTTP %i on the records read to a fixed, secret-free reason", async (status, pattern) => {
    const error = await sandbox(router({ records: () => json({ error: { code: `echo ${KEY}`, message: `bad key ${KEY}` } }, status) })).retrieve(morgan.transaction).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SandboxUnavailable);
    expect((error as Error).message).toMatch(pattern);
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).message).not.toContain("u_morgan");
  });

  it("forgets a patient that 404s or 410s so the next call looks again", async () => {
    for (const status of [404, 410]) {
      clearSandboxCache();
      const fetcher = router({ records: () => json({}, status) });
      const provider = sandbox(fetcher);
      await provider.retrieve(morgan.transaction).catch(() => undefined);
      await provider.retrieve(morgan.transaction).catch(() => undefined);
      expect(fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith("/users"))).toHaveLength(2);
    }
  });

  it("maps a 401 on the user list too, and a network error or timeout, without leaking the key", async () => {
    expect(await sandbox(router({ users: () => json({}, 401) })).retrieve(morgan.transaction).catch((e: Error) => e.message)).toMatch(/rejected the API key/);
    const boom = vi.fn<typeof fetch>(async () => { throw new TypeError(`fetch failed for ${KEY}`); });
    const message = await sandbox(boom).retrieve(morgan.transaction).catch((e: Error) => e.message);
    expect(message).toMatch(/could not reach FinchNode/);
    expect(message).not.toContain(KEY);
    const hang = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))));
    expect(await sandbox(hang, { timeoutMs: 20 }).retrieve(morgan.transaction).catch((e: Error) => e.message)).toMatch(/timed out/);
  });

  it("retries once after a 429, waiting Retry-After, and gives up if still limited", async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    let calls = 0;
    const limitedOnce = router({ records: () => ++calls === 1 ? json({}, 429, { "Retry-After": "2" }) : json(sandboxRecords()) });
    expect((await sandbox(limitedOnce, {}, sleep).retrieve(morgan.transaction)).source.tier).toBe("sandbox");
    expect(sleep).toHaveBeenCalledWith(2000);
    clearSandboxCache();
    const always = router({ records: () => json({}, 429) });
    expect(await sandbox(always, {}, sleep).retrieve(morgan.transaction).catch((e: Error) => e.message)).toMatch(/rate limiting/);
    expect(always.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith("/records"))).toHaveLength(2);
  });
});

describe("three-tier selection and honest labels", () => {
  const openDemo = (ok: boolean) => new FinchNodeDemoProvider(vi.fn<typeof fetch>(async () => { if (!ok) throw new TypeError("fetch failed"); return new Response(JSON.stringify(savedSnapshot("patient-demo-001"))); }), { timeoutMs: 8000, retries: 0 }, now);
  const chain = (sandboxFetch: typeof fetch, demoOk = true, config: Record<string, string | undefined> = env) => new DemoMedicalProvider(openDemo(demoOk), undefined, new FinchNodeSandboxProvider(() => config, sandboxFetch, now, undefined, async () => undefined));
  const investigate = (provider: DemoMedicalProvider) => investigateCase(createCase(morgan.transaction), provider, new MockCommunicationProvider(Number.POSITIVE_INFINITY));
  const sandboxWording = "Retrieved live from FinchNode sandbox with patient consent";

  it("(a) uses the consented sandbox patient when it is readable, and says so with the consent date", async () => {
    const next = await investigate(chain(router({})));
    expect(next.recordSource).toMatchObject({ tier: "sandbox", live: true, consentedAt: "2026-10-04" });
    expect(next.recordSource?.sandboxNote).toBeUndefined();
    const wording = JSON.stringify([next.auditLog, next.timeline]);
    expect(wording).toContain(sandboxWording);
    expect(wording).toContain("consent recorded 2026-10-04");
    expect(wording).not.toContain(LIVE_LABEL);
    expect(wording).not.toContain(FALLBACK_LABEL);
  });

  it("(b) uses the keyless open demo API, with the reason, when the sandbox patient is still syncing", async () => {
    const next = await investigate(chain(router({ users: () => json({ data: [], hasMore: false }) })));
    expect(next.recordSource).toMatchObject({ tier: "open-demo", live: true, label: LIVE_LABEL });
    expect(next.recordSource?.sandboxNote).toMatch(/still syncing/);
    const wording = JSON.stringify([next.auditLog, next.timeline]);
    expect(wording).toContain(LIVE_LABEL);
    expect(wording).toMatch(/sandbox patient not used: the sandbox patient has not appeared yet/);
    expect(wording).not.toContain(sandboxWording);
    expect(wording).not.toContain(FALLBACK_LABEL);
  });

  it("(b) also applies when no API key is configured", async () => {
    const next = await investigate(chain(vi.fn(), true, {}));
    expect(next.recordSource).toMatchObject({ tier: "open-demo", sandboxNote: "no FinchNode API key is configured" });
  });

  it("(c) uses the saved copy, never claiming a live pull, when FinchNode is unreachable at both tiers", async () => {
    const down = vi.fn<typeof fetch>(async () => { throw new TypeError("fetch failed"); });
    const next = await investigate(chain(down, false));
    expect(next.recordSource).toMatchObject({ tier: "saved-copy", live: false, label: FALLBACK_LABEL });
    expect(next.recordSource?.sandboxNote).toMatch(/could not reach FinchNode/);
    const wording = JSON.stringify([next.auditLog, next.timeline]);
    expect(wording).toContain(FALLBACK_LABEL);
    expect(wording).not.toContain(sandboxWording);
    expect(wording).not.toContain(LIVE_LABEL);
    expect(wording).not.toMatch(/retrieved live/i);
  });

  it("falls to the next tier when the sandbox rejects the key, consent is revoked, or the read is rate limited", async () => {
    for (const status of [401, 410, 429]) {
      clearSandboxCache();
      const next = await investigate(chain(router({ records: () => json({}, status) })));
      expect(next.recordSource?.tier).toBe("open-demo");
      expect(next.recordSource?.sandboxNote).toBeTruthy();
    }
  });

  it("never lets the API key reach any recorded case field", async () => {
    const leaky = router({ records: () => json({ error: KEY }, 401), users: () => json({ data: [user("u_morgan", "Baseline adult, age 38")], hasMore: false }) });
    for (const provider of [chain(router({})), chain(leaky), chain(vi.fn<typeof fetch>(async () => { throw new TypeError(`boom ${KEY}`); }), false)]) {
      expect(JSON.stringify(await investigate(provider))).not.toContain(KEY);
    }
  });

  it("only the sandbox tier is attempted for a FinchNode patient: the original rehearsal case never calls it", async () => {
    const fetcher = router({});
    const { legacyScenario } = await import("../scenarios");
    await chain(fetcher).retrieve(legacyScenario.transaction);
    expect(fetcher).not.toHaveBeenCalled();
    void harriet;
  });
});
