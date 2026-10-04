import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { MockCommunicationProvider } from "../communications/mock";
import type { HospitalBillLink } from "../communications/photon-bill-link";
import { extractPdfText } from "../communications/pdf-text";
import { SafeFetchError, validateBillUrl } from "../communications/safe-fetch";
import { ScenarioFinchNodeProvider } from "../medical/scenario-finchnode";
import { getScenario } from "../scenarios";
import { createCase, investigateCase } from "./orchestrator";
import { processBillLink, type BillLinkDeps } from "./read-bill-link";

const pdf = (name: string) => readFileSync(new URL(`../../../public/bills/${name}`, import.meta.url));
const maya = pdf("maya-ortiz-lr-20931.pdf");
const daniel = pdf("daniel-brooks-st-77140.pdf");
const link = (id: string, file = "maya-ortiz-lr-20931.pdf"): HospitalBillLink => ({ messageId: id, url: `https://bills.example.test/${file}?sig=SECRET` });

let store: CaseStore;
const open = async (scenarioId: string, overrides: Partial<{ id: string }> = {}) => {
  const transaction = { ...getScenario(scenarioId)!.transaction, ...overrides };
  const investigated = await investigateCase(createCase(transaction), new ScenarioFinchNodeProvider(), new MockCommunicationProvider(Number.POSITIVE_INFINITY));
  if (!overrides.id) investigated.scenarioId = scenarioId;
  store.create(investigated);
  return investigated.id;
};
const deps = (bytes: Buffer | Error, extra: Partial<BillLinkDeps> = {}): BillLinkDeps => ({
  verifyUrl: (url) => validateBillUrl(url, { allowedHosts: ["bills.example.test"] }),
  fetchPdf: async () => { if (bytes instanceof Error) throw bytes; return bytes; },
  extract: extractPdfText, paceMs: 0, ...extra
});
const run = (messageId: string, d: BillLinkDeps, file?: string) => { store.claimBillLink(messageId); return processBillLink(store, link(messageId, file), d); };

beforeEach(() => { store = new CaseStore(":memory:"); });

describe("hospital-texted bill PDF", () => {
  it("reads the PDF, records ordered real steps while it works, and advances the case", async () => {
    const id = await open("bike-wrist");
    const seen: number[] = [];
    const outcome = await run("m1", deps(maya, { paceMs: 5, sleep: async () => { seen.push(store.get(id)!.reading!.steps.length); } }));
    expect(outcome).toBe("applied");
    const saved = store.get(id)!;
    expect(saved.status).toBe("REVIEW_REQUIRED");
    expect(saved.bill?.invoiceId).toBe("LR-20931");
    expect(saved.reading?.done).toBe(true);
    expect(saved.reading?.failed).toBeUndefined();
    expect(saved.reading!.steps.map((step) => step.kind)).toEqual(["received", "verified", "download", "extract", "invoice", "provider", "patient", "date", "charge", "charge", "charge", "charge", "charge", "total", "done"]);
    const text = saved.reading!.steps.map((step) => step.text);
    expect(text[0]).toBe("Text received from hospital");
    expect(text).toContain("Found invoice LR-20931");
    expect(text).toContain("Provider: Lakeside Regional Medical Center");
    expect(text).toContain("Patient: Maya Ortiz");
    expect(text).toContain("Wrist X-ray $380.00 - matches 'Wrist X-ray radiology report'");
    expect(text).toContain("Orthopedic consultation $650.00 - no matching record, will ask billing");
    expect(text).toContain("Total $3,140.00 = sum of charges");
    expect(text.at(-1)).toBe("Done: 4 supported, 1 needs review");
    expect(saved.reading!.steps.filter((step) => step.kind === "charge").map((step) => step.status)).toEqual(["ok", "ok", "ok", "ok", "review"]);
    // Steps were persisted incrementally: before each paced step more of the reading already existed.
    expect(seen).toEqual([8, 9, 10, 11, 12, 13]);
    expect(saved.auditLog.some((entry) => entry.action === "BILL_LINK_APPLIED")).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("SECRET");
    expect(store.billLink("m1")).toMatchObject({ status: "APPLIED" });
  });

  it("matches by provider (and patient) among several waiting cases and leaves the others untouched", async () => {
    const mayaId = await open("bike-wrist");
    const danielId = await open("car-concussion");
    expect(await run("m2", deps(maya))).toBe("applied");
    expect(store.get(mayaId)!.status).toBe("REVIEW_REQUIRED");
    expect(store.get(mayaId)!.reading!.steps[0].text).toBe("Text received from hospital");
    expect(store.get(danielId)!.status).toBe("WAITING_FOR_BILL");
    expect(store.get(danielId)!.reading).toBeUndefined();
  });

  it("records an unmatched bill when its provider matches no waiting case, changing nothing else", async () => {
    const mayaId = await open("bike-wrist");
    expect(await run("m3", deps(daniel), "daniel-brooks-st-77140.pdf")).toBe("unmatched");
    const saved = store.get(mayaId)!;
    expect(saved.status).toBe("WAITING_FOR_BILL");
    expect(saved.bill).toBeNull();
    expect(saved.reading).toMatchObject({ done: true, failed: true });
    expect(saved.auditLog.at(-1)).toMatchObject({ action: "BILL_LINK_FAILED", status: "FAILED" });
    expect(store.billLink("m3")?.status).toBe("UNMATCHED");
  });

  it("does nothing when no case is waiting, and when two waiting cases match", async () => {
    expect(await run("m4", deps(maya))).toBe("unmatched");
    expect(store.billLink("m4")?.detail).toMatch(/No case is waiting/);
    const first = await open("bike-wrist", { id: "dup-a" });
    const second = await open("bike-wrist", { id: "dup-b" });
    expect(await run("m5", deps(maya))).toBe("unmatched");
    expect(store.get(first)!.status).toBe("WAITING_FOR_BILL");
    expect(store.get(second)!.status).toBe("WAITING_FOR_BILL");
    expect(store.get(first)!.bill).toBeNull();
    expect(store.billLink("m5")?.status).toBe("UNMATCHED");
  });

  it("fails visibly without changing state on a rejected link, failed download, or unreadable PDF", async () => {
    const id = await open("bike-wrist");
    expect(await run("m6", deps(maya, { verifyUrl: () => { throw new SafeFetchError("host_not_allowed", "Host evil.test is not on the bill host allowlist"); } }))).toBe("rejected");
    expect(store.get(id)!.reading!.steps.at(-1)).toMatchObject({ kind: "error", status: "fail" });
    expect(await run("m7", deps(new SafeFetchError("too_large", "The bill PDF is larger than the 5 MB limit")))).toBe("rejected");
    expect(await run("m8", deps(Buffer.from("%PDF-1.4 not really")))).toBe("failed");
    expect(await run("m9", deps(maya, { extract: async () => ({ pages: 1, text: "Lakeside Regional Medical Center\nInvoice Number: LR-1\nService Date September 14, 2026\n1 Emergency room 99284 $100.00\nTotal charges $999.00" }) }))).toBe("failed");
    const saved = store.get(id)!;
    expect(saved.status).toBe("WAITING_FOR_BILL");
    expect(saved.bill).toBeNull();
    expect(saved.reading!.steps.at(-1)!.text).toMatch(/Could not understand the bill/);
    expect(saved.auditLog.filter((entry) => entry.action === "BILL_LINK_FAILED")).toHaveLength(4);
    expect(store.billLink("m6")?.status).toBe("REJECTED");
    expect(store.billLink("m8")?.status).toBe("FAILED");
  });

  it("deduplicates redelivered messages by message ID", () => {
    expect(store.claimBillLink("same")).toBe(true);
    expect(store.claimBillLink("same")).toBe(false);
  });
});
