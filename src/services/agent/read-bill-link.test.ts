import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { MockCommunicationProvider } from "../communications/mock";
import type { HospitalBillLink } from "../communications/photon-bill-link";
import { extractPdfText } from "../communications/pdf-text";
import { SafeFetchError, validateBillUrl } from "../communications/safe-fetch";
import { MockMedicalRecordProvider } from "../medical/mock";
import { getScenario } from "../scenarios";
import { createCase, investigateCase } from "./orchestrator";
import { processBillLink, type BillLinkDeps } from "./read-bill-link";

const pdf = (name: string) => readFileSync(new URL(`../../../public/bills/${name}`, import.meta.url));
const morgan = pdf("morgan-rivera-ns-71802.pdf");
const harriet = pdf("harriet-lindqvist-ns-58417.pdf");
const link = (id: string, file = "morgan-rivera-ns-71802.pdf"): HospitalBillLink => ({ messageId: id, url: `https://bills.example.test/${file}?sig=SECRET` });

let store: CaseStore;
const open = async (scenarioId: string, overrides: Partial<{ id: string }> = {}) => {
  const transaction = { ...getScenario(scenarioId)!.transaction, ...overrides };
  const investigated = await investigateCase(createCase(transaction), new MockMedicalRecordProvider(), new MockCommunicationProvider(Number.POSITIVE_INFINITY));
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
/** The real PDF's text with edits, as the extractor would return it. */
const edited = (bytes: Buffer, edit: (text: string) => string): Partial<BillLinkDeps> => ({ extract: async (data) => { const result = await extractPdfText(data); return { ...result, text: edit(result.text) }; } });

beforeEach(() => { store = new CaseStore(":memory:"); });

describe("hospital-texted bill PDF", () => {
  it("reads the PDF, records ordered real steps while it works, and advances the case", async () => {
    const id = await open("morgan-wellness");
    const seen: number[] = [];
    const outcome = await run("m1", deps(morgan, { paceMs: 5, sleep: async () => { seen.push(store.get(id)!.reading!.steps.length); } }));
    expect(outcome).toBe("applied");
    const saved = store.get(id)!;
    expect(saved.status).toBe("REVIEW_REQUIRED");
    expect(saved.bill?.invoiceId).toBe("NS-71802");
    expect(saved.reading?.done).toBe(true);
    expect(saved.reading?.failed).toBeUndefined();
    expect(saved.reading!.steps.map((step) => step.kind)).toEqual(["received", "verified", "download", "extract", "invoice", "provider", "patient", "date", ...Array(7).fill("charge"), "total", "done"]);
    const text = saved.reading!.steps.map((step) => step.text);
    expect(text[0]).toBe("Text received from hospital");
    expect(text).toContain("Found invoice NS-71802");
    expect(text).toContain("Provider: Northstar Health System");
    expect(text).toContain("Patient: Morgan Rivera");
    expect(text).toContain("Hemoglobin A1c $94.00 - matches 'Hemoglobin A1c'");
    expect(text).toContain("Electrocardiogram, 12-lead $310.00 - no matching record, will ask billing");
    expect(text).toContain("Total $1,102.00 = sum of charges");
    expect(text.at(-1)).toBe("Done: 6 supported, 1 needs review");
    expect(saved.reading!.steps.filter((step) => step.kind === "charge").map((step) => step.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok", "review"]);
    // Steps were persisted incrementally: before each paced step more of the reading already existed.
    expect(seen).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(saved.auditLog.some((entry) => entry.action === "BILL_LINK_APPLIED")).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("SECRET");
    expect(store.billLink("m1")).toMatchObject({ status: "APPLIED" });
  });

  it("tells the three patients apart at their shared hospital by the name printed on the PDF", async () => {
    const morganId = await open("morgan-wellness");
    const harrietId = await open("harriet-kidney");
    const theoId = await open("theo-asthma");
    expect(await run("m2", deps(harriet), "harriet-lindqvist-ns-58417.pdf")).toBe("applied");
    expect(store.get(harrietId)!.status).toBe("REVIEW_REQUIRED");
    expect(store.get(harrietId)!.bill?.invoiceId).toBe("NS-58417");
    expect(store.get(harrietId)!.reading!.steps[0].text).toBe("Text received from hospital");
    for (const other of [morganId, theoId]) {
      expect(store.get(other)!.status).toBe("WAITING_FOR_BILL");
      expect(store.get(other)!.bill).toBeNull();
      expect(store.get(other)!.reading).toBeUndefined();
    }
    expect(await run("m2b", deps(morgan))).toBe("applied");
    expect(store.get(morganId)!.bill?.invoiceId).toBe("NS-71802");
    expect(store.get(theoId)!.status).toBe("WAITING_FOR_BILL");
  });

  it("falls back to the invoice number when the PDF does not name the patient", async () => {
    const morganId = await open("morgan-wellness");
    const harrietId = await open("harriet-kidney");
    expect(await run("m2c", deps(harriet, edited(harriet, (text) => text.replaceAll("Harriet Lindqvist", ""))), "harriet-lindqvist-ns-58417.pdf")).toBe("applied");
    expect(store.get(harrietId)!.bill?.patient).toBeUndefined();
    expect(store.get(harrietId)!.bill?.invoiceId).toBe("NS-58417");
    expect(store.get(morganId)!.status).toBe("WAITING_FOR_BILL");
  });

  it("fails visibly, applying nothing, when neither patient nor invoice number picks a single case", async () => {
    const morganId = await open("morgan-wellness");
    const harrietId = await open("harriet-kidney");
    const text = (value: string) => value.replaceAll("Harriet Lindqvist", "").replaceAll("NS-58417", "NS-99999");
    expect(await run("m2d", deps(harriet, edited(harriet, text)), "harriet-lindqvist-ns-58417.pdf")).toBe("unmatched");
    for (const id of [morganId, harrietId]) { expect(store.get(id)!.status).toBe("WAITING_FOR_BILL"); expect(store.get(id)!.bill).toBeNull(); }
    expect(store.billLink("m2d")).toMatchObject({ status: "UNMATCHED" });
    expect(store.billLink("m2d")?.detail).toMatch(/2 waiting cases at Northstar Health System/);
  });

  it("records an unmatched bill when it names a patient who is not waiting, changing nothing else", async () => {
    const morganId = await open("morgan-wellness");
    expect(await run("m3", deps(harriet), "harriet-lindqvist-ns-58417.pdf")).toBe("unmatched");
    const saved = store.get(morganId)!;
    expect(saved.status).toBe("WAITING_FOR_BILL");
    expect(saved.bill).toBeNull();
    expect(saved.reading).toMatchObject({ done: true, failed: true });
    expect(saved.auditLog.at(-1)).toMatchObject({ action: "BILL_LINK_FAILED", status: "FAILED" });
    expect(store.billLink("m3")?.status).toBe("UNMATCHED");
    expect(store.billLink("m3")?.detail).toMatch(/Harriet Lindqvist/);
  });

  it("records an unmatched bill when its provider matches no waiting case", async () => {
    await open("morgan-wellness");
    expect(await run("m3b", deps(morgan, edited(morgan, (text) => text.replaceAll("Northstar Health System", "Other General Hospital"))))).toBe("unmatched");
    expect(store.billLink("m3b")?.detail).toMatch(/Other General Hospital/);
  });

  it("does nothing when no case is waiting, and when two waiting cases match", async () => {
    expect(await run("m4", deps(morgan))).toBe("unmatched");
    expect(store.billLink("m4")?.detail).toMatch(/No case is waiting/);
    const first = await open("morgan-wellness", { id: "dup-a" });
    const second = await open("morgan-wellness", { id: "dup-b" });
    expect(await run("m5", deps(morgan))).toBe("unmatched");
    expect(store.get(first)!.status).toBe("WAITING_FOR_BILL");
    expect(store.get(second)!.status).toBe("WAITING_FOR_BILL");
    expect(store.get(first)!.bill).toBeNull();
    expect(store.billLink("m5")?.status).toBe("UNMATCHED");
  });

  it("fails visibly without changing state on a rejected link, failed download, or unreadable PDF", async () => {
    const id = await open("morgan-wellness");
    expect(await run("m6", deps(morgan, { verifyUrl: () => { throw new SafeFetchError("host_not_allowed", "Host evil.test is not on the bill host allowlist"); } }))).toBe("rejected");
    expect(store.get(id)!.reading!.steps.at(-1)).toMatchObject({ kind: "error", status: "fail" });
    expect(await run("m7", deps(new SafeFetchError("too_large", "The bill PDF is larger than the 5 MB limit")))).toBe("rejected");
    expect(await run("m8", deps(Buffer.from("%PDF-1.4 not really")))).toBe("failed");
    expect(await run("m9", deps(morgan, { extract: async () => ({ pages: 1, text: "Northstar Health System\nInvoice Number: NS-1\nService Date July 18, 2026\n1 Annual wellness visit 99395 $100.00\nTotal charges $999.00" }) }))).toBe("failed");
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
