import type { CaseStore } from "../../lib/db";
import type { ItemizedBill, MedicalBillCase, ReadingStep } from "../../types/domain";
import type { HospitalBillLink } from "../communications/photon-bill-link";
import { BillParseError, parsePdfBill } from "../communications/parse-pdf-bill";
import { PdfReadError, extractPdfText } from "../communications/pdf-text";
import { SafeFetchError, billFetchOptions, fetchBillPdf, redactUrl, validateBillUrl } from "../communications/safe-fetch";
import { reconcile } from "../reconciliation/reconcile";
import { getScenario, statementInvoice } from "../scenarios";
import { CaseBusyError } from "./case-operation";
import { receiveParsedBill, scenarioIdOf } from "./orchestrator";

export interface BillLinkDeps {
  /** Throws SafeFetchError when the link is not acceptable; returns the URL that would be fetched. */
  verifyUrl(url: string): URL;
  fetchPdf(url: string): Promise<Buffer>;
  extract(bytes: Uint8Array): Promise<{ pages: number; text: string }>;
  /**
   * Pause before each per-charge step. The work itself (download, extraction, parsing, matching) is
   * real; this delay is pure presentation pacing so a person watching the case page can follow each
   * charge being checked. It is 0 in tests and configurable with GUARDIAN_READING_PACE_MS.
   */
  paceMs: number;
  sleep?(ms: number): Promise<void>;
}

export type BillLinkOutcome = "applied" | "unmatched" | "rejected" | "failed";

export function defaultBillLinkDeps(): BillLinkDeps {
  const options = billFetchOptions();
  const pace = Number(process.env.GUARDIAN_READING_PACE_MS ?? (process.env.NODE_ENV === "test" ? 0 : 450));
  return { verifyUrl: (url) => validateBillUrl(url, options), fetchPdf: (url) => fetchBillPdf(url, options), extract: extractPdfText, paceMs: Number.isFinite(pace) && pace >= 0 ? Math.min(pace, 2000) : 450 };
}

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Applies a change to a case under the same persisted operation guard mutateCase uses, waiting briefly if another operation holds it. */
async function withCase(store: CaseStore, id: string, change: (current: MedicalBillCase) => MedicalBillCase): Promise<MedicalBillCase | null> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const token = store.acquireOperation(id);
    if (token) {
      try {
        const current = store.get(id);
        if (!current) return null;
        const next = change(structuredClone(current));
        next.updatedAt = new Date().toISOString();
        store.save(next);
        return next;
      } finally { store.releaseOperation(id, token); }
    }
    await wait(50);
  }
  throw new CaseBusyError("The case stayed busy while recording the bill reading");
}

const stepFor = (kind: ReadingStep["kind"], text: string, status?: ReadingStep["status"], detail?: string, item?: ReadingStep["item"]): ReadingStep => ({ id: crypto.randomUUID(), at: new Date().toISOString(), kind, text, status, detail, item });

/**
 * Collects reading steps and writes each one to the case the moment it happens. When several cases
 * are waiting, the owning case is unknown until the bill's provider has been read, so earlier steps
 * are held in memory and flushed the instant a single case matches.
 */
class ReadingSink {
  private pending: ReadingStep[] = [];
  private started = false;
  constructor(private readonly store: CaseStore, private target?: string) {}
  get caseId() { return this.target; }

  async emit(kind: ReadingStep["kind"], text: string, status: ReadingStep["status"] = "ok", detail?: string, item?: ReadingStep["item"]) {
    const step = stepFor(kind, text, status, detail, item);
    if (!this.target) { this.pending.push(step); return; }
    await this.write([step]);
  }

  async attach(caseId: string) {
    this.target = caseId;
    const buffered = this.pending; this.pending = [];
    if (buffered.length) await this.write(buffered);
  }

  /** Writes steps, optionally marking the reading finished in the same save as `extra`. */
  async write(steps: ReadingStep[], finish?: { failed: boolean }, extra?: (next: MedicalBillCase) => MedicalBillCase) {
    if (!this.target) return;
    const first = !this.started; this.started = true;
    await withCase(this.store, this.target, (current) => {
      const reading = first || !current.reading ? { startedAt: steps[0]?.at ?? new Date().toISOString(), steps: [], done: false } : current.reading;
      reading.steps.push(...steps);
      if (finish) { reading.done = true; if (finish.failed) reading.failed = true; }
      current.reading = reading;
      return extra ? extra({ ...current, reading }) : current;
    });
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const scenarioOf = (candidate: MedicalBillCase) => { const id = scenarioIdOf(candidate); return id ? getScenario(id) : undefined; };
function patientMatches(candidate: MedicalBillCase, bill: ItemizedBill): boolean {
  const scenario = scenarioOf(candidate);
  if (!bill.patient || !scenario) return true;
  return sameName(bill.patient, `${scenario.patient.firstName} ${scenario.patient.lastName}`);
}
const invoiceMatches = (candidate: MedicalBillCase, bill: ItemizedBill): boolean => { const scenario = scenarioOf(candidate); return Boolean(scenario) && statementInvoice(scenario!).toLowerCase() === bill.invoiceId.toLowerCase(); };

const audit = (current: MedicalBillCase, action: string, tool: string, input: string, output: string, status: "SUCCESS" | "FAILED") => {
  current.auditLog.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), action, tool, inputSummary: input, outputSummary: output, status });
  return current;
};

/**
 * Handles one claimed hospital bill-link text end to end: verify and download the PDF, read it,
 * match it to the single case waiting for a bill from that provider, check every charge against the
 * retrieved records while recording each real step on the case, then hand the parsed bill to the
 * same analysis path the plain-text statement uses. Any failure leaves the case state unchanged
 * (still waiting) with a visible error step and audit entry, so a corrected link can be retried.
 */
export async function processBillLink(store: CaseStore, link: HospitalBillLink, deps: BillLinkDeps): Promise<BillLinkOutcome> {
  const sleep = deps.sleep ?? wait;
  const active = store.activeCase();
  const waiting = (active ? [active] : store.list()).filter((candidate) => candidate.status === "WAITING_FOR_BILL");
  if (!waiting.length) { store.finishBillLink(link.messageId, "UNMATCHED", "No case is waiting for an itemized bill"); return "unmatched"; }
  const sink = new ReadingSink(store, waiting.length === 1 ? waiting[0].id : undefined);
  const where = redactUrl(link.url);
  const fail = async (text: string, detail: string | undefined, status: string, outcome: BillLinkOutcome): Promise<BillLinkOutcome> => {
    await sink.emit("error", text, "fail", detail);
    if (sink.caseId) {
      await sink.write([], { failed: true }, (next) => audit(next, "BILL_LINK_FAILED", "readBillLink", where, `${text}${detail ? `: ${detail}` : ""}`, "FAILED"));
    }
    store.finishBillLink(link.messageId, status, `${text}${detail ? `: ${detail}` : ""}`.slice(0, 300));
    return outcome;
  };

  try {
    await sink.emit("received", "Text received from hospital", "ok", where);
    let verified: URL;
    try { verified = deps.verifyUrl(link.url); }
    catch (error) { return await fail("Link rejected", error instanceof SafeFetchError ? error.message : "The link is not acceptable", "REJECTED", "rejected"); }
    await sink.emit("verified", "Link verified (host allowed)", "ok", verified.host);
    await sink.emit("download", "Downloading PDF", "ok", redactUrl(verified));

    let bytes: Buffer;
    try { bytes = await deps.fetchPdf(link.url); }
    catch (error) { return await fail("Could not download the bill", error instanceof SafeFetchError ? error.message : "The download failed", "REJECTED", "rejected"); }

    let extracted: { pages: number; text: string };
    try { extracted = await deps.extract(bytes); }
    catch (error) { return await fail("Could not read the PDF", error instanceof PdfReadError ? error.message : "The file is not a readable PDF", "FAILED", "failed"); }
    await sink.emit("extract", `Extracted ${extracted.pages} ${extracted.pages === 1 ? "page" : "pages"} of text`, "ok", `${Math.max(1, Math.round(bytes.length / 1024))} KB PDF`);

    let bill: ItemizedBill;
    try { bill = parsePdfBill(extracted.text); }
    catch (error) { return await fail("Could not understand the bill", error instanceof BillParseError ? error.message : undefined, "FAILED", "failed"); }
    await sink.emit("invoice", `Found invoice ${bill.invoiceId}`);
    await sink.emit("provider", `Provider: ${bill.provider}`);
    if (bill.patient) await sink.emit("patient", `Patient: ${bill.patient}`);
    await sink.emit("date", `Service date ${bill.items[0].serviceDate}`);

    // Several patients can wait on the same hospital: narrow by the patient name printed on the PDF, then by its invoice number, and refuse to guess if that is still not one case.
    const atProvider = waiting.filter((candidate) => candidate.provider.name === bill.provider);
    let matches = atProvider.filter((candidate) => patientMatches(candidate, bill));
    if (matches.length > 1) { const byInvoice = matches.filter((candidate) => invoiceMatches(candidate, bill)); if (byInvoice.length === 1) matches = byInvoice; }
    if (matches.length !== 1) {
      const text = matches.length ? `This bill matches ${matches.length} waiting cases at ${bill.provider} (patient and invoice number do not pick one), so it was not applied`
        : atProvider.length ? `This bill names ${bill.patient ?? "no patient"}, who does not match any case waiting at ${bill.provider}, so it was not applied`
        : `This bill is from ${bill.provider}, which does not match a case waiting for a bill`;
      return await fail(text, undefined, "UNMATCHED", "unmatched");
    }
    const match = matches[0];
    if (sink.caseId !== match.id) await sink.attach(match.id);

    const records = store.get(match.id)?.medicalRecords ?? match.medicalRecords;
    const findings = reconcile(bill, records);
    for (const item of bill.items) {
      await sleep(deps.paceMs);
      const finding = findings.find((entry) => entry.billItemId === item.id)!;
      const evidence = records.filter((record) => finding.evidenceRecordIds?.includes(record.id));
      const label = `${item.description} ${money(item.amount)}`;
      if (finding.clinicalStatus === "SUPPORTED" && evidence.length) await sink.emit("charge", `${label} - matches '${evidence[0].description}'`, "ok", evidence.map((record) => `${record.type} · ${record.date}`).join(", "), { description: item.description, amount: item.amount });
      else if (finding.clinicalStatus === "NO_MATCH_FOUND" || finding.clinicalStatus === "INSUFFICIENT_DATA") await sink.emit("charge", `${label} - no matching record, will ask billing`, "review", finding.explanation, { description: item.description, amount: item.amount });
      else await sink.emit("charge", `${label} - needs review, will ask billing`, "review", finding.explanation, { description: item.description, amount: item.amount });
    }
    await sleep(deps.paceMs);
    await sink.emit("total", `Total ${money(bill.total)} = sum of charges`, "ok");

    let summary = "";
    await sink.write([], { failed: false }, (current) => {
      const applied = receiveParsedBill(current, bill, "pdf");
      const supported = applied.findings.filter((finding) => finding.clinicalStatus === "SUPPORTED").length;
      const review = applied.findings.filter((finding) => finding.action === "REQUEST_REVIEW").length;
      summary = `Done: ${supported} supported, ${review} needs review`;
      applied.reading!.steps.push(stepFor("done", summary, review ? "review" : "ok"));
      audit(applied, "BILL_LINK_APPLIED", "readBillLink", `${link.messageId} ${where}`, "Approved hospital sender; PDF read, provider matched, charges checked", "SUCCESS");
      applied.timeline.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), title: "Hospital texted the bill", detail: `Guardian downloaded and read the itemized PDF for invoice ${bill.invoiceId}`, source: "Photon", status: "complete" });
      return applied;
    });
    store.finishBillLink(link.messageId, "APPLIED", summary);
    return "applied";
  } catch (error) {
    // Unexpected failure (for example the case left WAITING_FOR_BILL while we were reading): record it and leave the case state alone.
    const detail = error instanceof CaseBusyError ? "The case was busy" : "The bill could not be applied to the case";
    return fail("Could not apply the bill", detail, "FAILED", "failed");
  }
}
