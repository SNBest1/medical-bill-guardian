import { describe, expect, it, vi } from "vitest";
import { DemoMedicalProvider, FALLBACK_LABEL, FinchNodeDemoProvider, LIVE_LABEL } from "./finchnode-demo";
import { savedSnapshot } from "./finchnode-fixtures";
import { describeCounts, describeRecordSource } from "./record-source";
import { legacyScenario, scenarios } from "../scenarios";
import { analyzeCase, createCase, investigateCase, notifyCase, reviewCase } from "../agent/orchestrator";
import { MockCommunicationProvider } from "../communications/mock";

const now = () => new Date("2026-10-04T12:00:00Z");
/** Serves the saved real response for whatever subject is requested, as the public demo API would. */
const serving = () => vi.fn<typeof fetch>(async (input) => {
  const subject = decodeURIComponent(String(input).match(/\/users\/([^/]+)\/records$/)![1]);
  return new Response(JSON.stringify(savedSnapshot(subject)), { status: 200, headers: { "Content-Type": "application/json" } });
});
const down = () => vi.fn<typeof fetch>(async () => { throw new TypeError("fetch failed"); });
const morgan = scenarios[0];

describe("FinchNodeDemoProvider: live pull", () => {
  it("makes a keyless read-only GET to the public demo API for the case's subject", async () => {
    const fetcher = serving();
    const { source } = await new FinchNodeDemoProvider(fetcher, undefined, now).retrieve(morgan.transaction);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.finchnode.com/demo/v1/users/patient-demo-001/records");
    expect(init?.method ?? "GET").toBe("GET");
    expect(JSON.stringify(init?.headers)).not.toMatch(/authorization|bearer|key/i);
    expect(source).toMatchObject({ live: true, label: LIVE_LABEL, subject: "patient-demo-001", organization: "Northstar Health System", retrievedAt: "2026-10-04T12:00:00.000Z" });
    expect(LIVE_LABEL).toBe("Records retrieved live from FinchNode public demo API (synthetic patient)");
    expect(source.fallbackReason).toBeUndefined();
  });

  it("keeps only the records tied to the case's encounter window, with counts per category", async () => {
    const provider = new FinchNodeDemoProvider(serving(), undefined, now);
    const morganPull = await provider.retrieve(morgan.transaction);
    expect(morganPull.source.counts).toEqual({ encounters: 1, diagnosticReports: 1, labs: 6, medicationAdministrations: 1, medications: 2, vitals: 6, documents: 1 });
    expect(morganPull.records.every((record) => record.date === "2026-07-18" && record.provider.startsWith("Northstar Health System"))).toBe(true);
    // Years of other history in the same pull are not evidence for this payment.
    const harriet = await provider.retrieve(scenarios[1].transaction);
    expect(harriet.records.every((record) => record.date === "2026-01-20")).toBe(true);
    expect(harriet.records.some((record) => record.date === "2026-07-14")).toBe(false);
    expect(harriet.source.counts).toMatchObject({ encounters: 1, diagnosticReports: 1, labs: 11 });
    const theo = await provider.retrieve(scenarios[2].transaction);
    expect(theo.records.map((record) => record.category).sort()).toEqual(["encounters", "medications", "medications", "vitals", "vitals"]);
    expect(describeCounts(theo.source.counts)).toBe("1 encounter, 2 medications on record, 2 vital signs");
  });

  it("drops records from another organization even on the service date", async () => {
    const snapshot = structuredClone(savedSnapshot("patient-demo-001")!);
    snapshot.data!.labs!.push({ id: "lab-elsewhere", name: "Glucose", date: "2026-07-18T15:30:00Z", sourceName: "Elsewhere Clinic" });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(snapshot)));
    const { records } = await new FinchNodeDemoProvider(fetcher, undefined, now).retrieve(morgan.transaction);
    expect(records.some((record) => record.id === "lab-elsewhere")).toBe(false);
  });

  it("retries once after a failure and still reports a live pull", async () => {
    const fetcher = serving();
    fetcher.mockRejectedValueOnce(new TypeError("fetch failed"));
    const { source } = await new FinchNodeDemoProvider(fetcher, undefined, now).retrieve(morgan.transaction);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(source.live).toBe(true);
  });
});

describe("FinchNodeDemoProvider: labeled fallback", () => {
  it.each([
    ["the network is down", down()],
    ["the API answers 503", vi.fn<typeof fetch>(async () => new Response("unavailable", { status: 503 }))],
    ["the API answers with something that is not this patient", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "someone-else", synthetic: true, data: {} })))]
  ])("uses the saved copy and says so when %s", async (_name, fetcher) => {
    const { records, source } = await new FinchNodeDemoProvider(fetcher, { timeoutMs: 8000, retries: 1 }, now).retrieve(morgan.transaction);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(source).toMatchObject({ live: false, label: FALLBACK_LABEL, subject: "patient-demo-001" });
    expect(FALLBACK_LABEL).toBe("FinchNode unreachable - using the saved copy of this synthetic patient");
    expect(source.fallbackReason).toBeTruthy();
    expect(JSON.stringify(source)).not.toMatch(/live from/i);
    // The saved copy is the same patient and the same evidence a live pull returns.
    const live = await new FinchNodeDemoProvider(serving(), undefined, now).retrieve(morgan.transaction);
    expect(records).toEqual(live.records);
  });

  it("gives up on a hung request after the timeout, then retries once, then falls back", async () => {
    const hang = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))));
    const started = Date.now();
    const { source } = await new FinchNodeDemoProvider(hang, { timeoutMs: 25, retries: 1 }, now).retrieve(morgan.transaction);
    expect(hang).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(source).toMatchObject({ live: false, fallbackReason: "timed out" });
  });

  it("refuses a payment that is not tied to a FinchNode patient instead of inventing records", async () => {
    await expect(new FinchNodeDemoProvider(serving(), undefined, now).retrieve(legacyScenario.transaction)).rejects.toThrow(/not tied to a FinchNode demo patient/);
  });
});

describe("DemoMedicalProvider routing", () => {
  it("pulls for FinchNode patients but never calls the network for the original rehearsal case", async () => {
    const fetcher = serving();
    const provider = new DemoMedicalProvider(new FinchNodeDemoProvider(fetcher, undefined, now));
    expect((await provider.retrieve(scenarios[1].transaction)).source.live).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const rehearsal = await provider.retrieve(legacyScenario.transaction);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(rehearsal.source).toEqual({ label: expect.stringContaining("no live FinchNode call"), live: false });
  });
});

describe("case records the retrieval honestly", () => {
  const investigate = (fetcher: typeof fetch, scenario = morgan) => investigateCase(createCase(scenario.transaction), new DemoMedicalProvider(new FinchNodeDemoProvider(fetcher, { timeoutMs: 8000, retries: 1 }, now)), new MockCommunicationProvider(Number.POSITIVE_INFINITY));

  it("a live pull is stated in the audit log and timeline with time, subject, and counts", async () => {
    const next = await investigate(serving());
    expect(next.recordSource).toMatchObject({ live: true, label: LIVE_LABEL, subject: "patient-demo-001" });
    for (const text of [next.auditLog.find((entry) => entry.action === "FETCH_RECORDS")!.outputSummary, next.timeline.find((event) => event.title === "Medical records retrieved")!.detail]) {
      expect(text).toContain(LIVE_LABEL);
      expect(text).toContain("subject patient-demo-001");
      expect(text).toContain("retrieved 2026-10-04 12:00:00 UTC");
      expect(text).toContain("1 encounter, 1 diagnostic report, 6 lab results, 1 medication administered");
    }
    expect(next.auditLog.find((entry) => entry.action === "MATCH_ENCOUNTER")?.outputSummary).toBeTruthy();
  });

  it("a fallback is never described as a live pull anywhere on the case", async () => {
    const next = await investigate(down());
    expect(next.recordSource).toMatchObject({ live: false, label: FALLBACK_LABEL });
    const wording = JSON.stringify([next.auditLog, next.timeline, next.recordSource]);
    expect(wording).toContain(FALLBACK_LABEL);
    expect(wording).not.toContain("retrieved live");
    expect(wording).not.toContain(LIVE_LABEL);
    expect(next.medicalRecords.length).toBeGreaterThan(0);
  });

  it("describeRecordSource keeps the older wording for sources that carry only a label", () => {
    expect(describeRecordSource({ label: "Static label", live: false }, 4)).toBe("4 records. Static label");
  });
});

describe("each FinchNode patient end to end with a live pull (mocked response)", () => {
  for (const scenario of scenarios) {
    it(`${scenario.id}: records, bill, review, and outcome`, async () => {
      const comms = new MockCommunicationProvider(0);
      const medical = new DemoMedicalProvider(new FinchNodeDemoProvider(serving(), undefined, now));
      const investigated = await investigateCase(createCase(scenario.transaction), medical, comms);
      expect(investigated.status).toBe("WAITING_FOR_BILL");
      expect(investigated.medicalRecords.length).toBeGreaterThan(5 - 1);
      const analyzed = await analyzeCase(investigated, comms);
      expect(analyzed.bill?.invoiceId).toMatch(/^NS-/);
      expect(analyzed.bill?.total).toBe(scenario.transaction.amount);
      if (!scenario.outcome.flagged) {
        expect(analyzed.status).toBe("RESOLVED");
        expect(analyzed.findings.every((finding) => finding.clinicalStatus === "SUPPORTED")).toBe(true);
        expect((await notifyCase(analyzed, comms)).status).toBe("USER_NOTIFIED");
        return;
      }
      expect(analyzed.status).toBe("REVIEW_REQUIRED");
      expect(analyzed.findings.filter((finding) => finding.action === "REQUEST_REVIEW").map((finding) => `${finding.description}:${finding.clinicalStatus}`)).toEqual([`${scenario.outcome.flagged}:NO_MATCH_FOUND`]);
      const reviewed = await reviewCase(analyzed, comms, true);
      const removed = scenario.outcome.result === "DUPLICATE_REMOVED";
      expect(reviewed.resolution).toMatchObject({ result: scenario.outcome.result, adjustment: removed ? 310 : 0, correctedTotal: removed ? scenario.transaction.amount - 310 : scenario.transaction.amount });
      expect(reviewed.recovery?.status).toBe(removed ? "REFUND_PENDING" : undefined);
      expect((await notifyCase(reviewed, comms)).status).toBe("USER_NOTIFIED");
    });
  }
});
