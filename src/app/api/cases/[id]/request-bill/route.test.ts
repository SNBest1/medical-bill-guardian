import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseStore } from "../../../../../lib/db";
import { createCase, investigateCase } from "../../../../../services/agent/orchestrator";
import { FishDemoCommunicationProvider } from "../../../../../services/communications/fish-demo";
import { MockCommunicationProvider } from "../../../../../services/communications/mock";
import { MockMedicalRecordProvider } from "../../../../../services/medical/mock";
import { scenarios } from "../../../../../services/scenario-data";

const fetcher = vi.fn<typeof fetch>();
let store: CaseStore;
let provider: FishDemoCommunicationProvider | MockCommunicationProvider;

vi.mock("../../../../../lib/db", async (original) => ({ ...(await original<typeof import("../../../../../lib/db")>()), getStore: () => store }));
vi.mock("../../../../../lib/providers", () => ({ communicationProvider: () => provider }));

const config = { apiKey: "fish-secret", agentId: "agent-1", phoneNumberId: "phone-1", toNumber: "+15555550100", hospitalPhone: "+15555550100", guardianLine: "+15555550142" };
const scenario = scenarios[0];
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => new Request("http://localhost/api/cases/x/request-bill", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

async function pausedCase() {
  provider = new FishDemoCommunicationProvider(config, fetcher);
  const paused = await investigateCase(createCase(scenario.transaction), new MockMedicalRecordProvider(), provider);
  store.create(paused);
  return paused;
}

beforeEach(() => {
  store = new CaseStore(":memory:");
  fetcher.mockReset();
  fetcher.mockImplementation(async () => new Response(JSON.stringify({ session_id: "sess-1", status: "queued" }), { status: 201 }));
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/cases/[id]/request-bill", () => {
  it("rejects a missing authorization flag and bad JSON without calling Fish", async () => {
    const { POST } = await import("./route");
    const paused = await pausedCase();
    expect((await POST(post({}), context(paused.id))).status).toBe(400);
    expect((await POST(post({ authorized: "true" }), context(paused.id))).status).toBe(400);
    expect((await POST(post("not json"), context(paused.id))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.get(paused.id)?.status).toBe("REQUESTING_BILL");
  });

  it("404s an unknown case", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ authorized: true }), context("nope"))).status).toBe(404);
  });

  it("places exactly one call, records the session, and ignores a destination in the body", async () => {
    const { POST } = await import("./route");
    const paused = await pausedCase();
    const response = await POST(post({ authorized: true, to_number: "+15555550999", toNumber: "+15555550999" }), context(paused.id));
    expect(response.status).toBe(200);
    const saved = store.get(paused.id)!;
    expect(saved.status).toBe("WAITING_FOR_BILL");
    expect(saved.communications[0]).toMatchObject({ status: "PENDING", result: "Fish call queued · session sess-1" });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).to_number).toBe("+15555550100");

    const repeat = await POST(post({ authorized: true }), context(paused.id));
    expect(repeat.status).toBe(409);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.get(paused.id)?.communications).toHaveLength(1);
  });

  it("returns safe text for a Fish failure, keeps the case retryable, and leaks nothing", async () => {
    const { POST } = await import("./route");
    const paused = await pausedCase();
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: "secret fish-secret +15555550100 detail" }), { status: 402 }));
    const response = await POST(post({ authorized: true }), context(paused.id));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).toContain("insufficient balance");
    for (const leak of ["fish-secret", "+15555550100", "detail"]) expect(text).not.toContain(leak);
    expect(store.get(paused.id)?.status).toBe("REQUESTING_BILL");
    expect((await POST(post({ authorized: true }), context(paused.id))).status).toBe(200);
  });

  it("explains an unsafe configuration without calling Fish or echoing numbers", async () => {
    const { POST } = await import("./route");
    provider = new FishDemoCommunicationProvider({ ...config, hospitalPhone: "+15555550111" }, fetcher);
    const paused = await investigateCase(createCase(scenario.transaction), new MockMedicalRecordProvider(), provider);
    store.create(paused);
    const response = await POST(post({ authorized: true }), context(paused.id));
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toContain("must equal DEMO_HOSPITAL_PHONE");
    expect(text).not.toContain("5555550");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a case that is not at the authorization checkpoint", async () => {
    const { POST } = await import("./route");
    provider = new MockCommunicationProvider(Number.POSITIVE_INFINITY);
    const waiting = await investigateCase(createCase(scenario.transaction), new MockMedicalRecordProvider(), provider);
    store.create(waiting);
    const response = await POST(post({ authorized: true }), context(waiting.id));
    expect(response.status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("GET /api/cases/[id]/request-bill", () => {
  it("reports Fish is off when it is not configured", async () => {
    const { GET } = await import("./route");
    const paused = await pausedCase();
    for (const name of ["FISH_API_KEY", "FISH_AGENT_ID", "FISH_PHONE_NUMBER_ID", "FISH_TEST_TO_NUMBER"]) vi.stubEnv(name, "");
    expect(await (await GET(new Request("http://localhost"), context(paused.id))).json()).toEqual({ fish: false });
  });

  it("returns the brief with masked numbers only", async () => {
    const { GET } = await import("./route");
    const paused = await pausedCase();
    vi.stubEnv("FISH_API_KEY", "fish-secret"); vi.stubEnv("FISH_AGENT_ID", "agent-1"); vi.stubEnv("FISH_PHONE_NUMBER_ID", "phone-1");
    vi.stubEnv("FISH_TEST_TO_NUMBER", "+15555550100"); vi.stubEnv("DEMO_HOSPITAL_PHONE", "+15555550100"); vi.stubEnv("SPECTRUM_HOSPITAL_ASSIGNED_LINE", "+15555550142");
    const text = await (await GET(new Request("http://localhost"), context(paused.id))).text();
    const body = JSON.parse(text);
    expect(body).toMatchObject({ fish: true, ready: true, problems: [], destination: "ending 0100", guardianLine: "ending 0142" });
    expect(body.brief.join(" ")).toContain("Maya Ortiz");
    for (const leak of ["fish-secret", "+15555550100", "+15555550142", "agent-1"]) expect(text).not.toContain(leak);
  });
});
