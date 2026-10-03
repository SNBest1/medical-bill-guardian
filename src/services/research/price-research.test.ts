import { describe, expect, it, vi } from "vitest";
import { evaluatePriceResearch, loadResearchCatalog, validateResearchRequest, type PriceResearchRequest } from "./price-research";
import { fetchLiveCatalog } from "./live-source";
import { parseRelayResearchCommand, sendRelayResearchReply } from "./relay-research";

const request: PriceResearchRequest = { requestId: "research_demo", code: "99285", codeSystem: "CPT", provider: "UNIVERSITY OF MICHIGAN HEALTH", serviceDate: "2026-04-20", billedAmount: 2000, coverage: "SELF_PAY" };
const catalog = loadResearchCatalog();

describe("price research evidence boundaries", () => {
  it("returns exact-provider candidates with context gaps, never a refund", () => {
    const result = evaluatePriceResearch(request, catalog, "CACHED_SNAPSHOT");
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.status).toBe("NEEDS_CONTEXT");
    expect(result.missingContext).toContain("units");
    expect(result).not.toHaveProperty("refund");
    expect(result.candidates.every(rate => rate.basis === "CASH")).toBe(true);
  });
  it("does not substitute a hospital with a similar name", () => {
    expect(evaluatePriceResearch({ ...request, provider: "University Hospital" }, catalog, "CACHED_SNAPSHOT").candidateCount).toBe(0);
  });
  it("does not substitute cash prices for missing insurance contracts", () => {
    const result = evaluatePriceResearch({ ...request, coverage: "INSURED" }, catalog, "CACHED_SNAPSHOT");
    expect(result.candidateCount).toBe(0);
    expect(result.missingContext).toEqual(expect.arrayContaining(["payer", "plan", "network"]));
  });
  it("rejects patient payloads and invalid calendar dates", () => {
    expect(() => validateResearchRequest({ ...request, patientName: "Demo" })).toThrow();
    expect(() => validateResearchRequest({ ...request, serviceDate: "2026-02-30" })).toThrow();
    expect(() => validateResearchRequest({ ...request, providerNpi: 1003878539 })).toThrow();
  });
  it("parses Relay commands and blocks unapproved destinations before network access", async () => {
    expect(parseRelayResearchCommand("RESEARCH_PRICE\n" + JSON.stringify(request))).toEqual(request);
    const fetcher = vi.fn();
    await expect(sendRelayResearchReply(evaluatePriceResearch(request, catalog, "CACHED_SNAPSHOT"), { token: "test", apiUrl: "https://api.staging.relayapp.im", chatId: "other", approvedChatIds: ["research"] }, fetcher)).rejects.toThrow("approved chat");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it.skipIf(process.env.PRICE_RESEARCH_LIVE_TEST !== "1")("fetches the live publisher and verifies source provenance", async () => {
  const live = await fetchLiveCatalog(request.code);
  expect(live.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(live.records.length).toBeGreaterThan(0);
  expect(evaluatePriceResearch(request, live, "LIVE_SOURCE_FETCH").candidateCount).toBeGreaterThan(0);
}, 60000);
