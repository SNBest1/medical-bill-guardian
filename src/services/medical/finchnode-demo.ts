import type { MedicalRecord, RecordSource, Transaction } from "../../types/domain";
import { scenarioForTransaction } from "../scenarios";
import type { FinchSnapshot } from "./finchnode";
import { caseRecords, countByCategory } from "./record-window";
import { FinchNodeSandboxProvider, SandboxUnavailable } from "./finchnode-sandbox";
import { savedSnapshot } from "./finchnode-fixtures";
import type { MedicalRecordProvider, RetrievedRecords } from "./provider";
import { SCENARIO_RECORDS_LABEL, ScenarioFinchNodeProvider } from "./scenario-finchnode";

/** FinchNode's keyless public demo API. Read-only; it serves fixed fictional patients. */
export const FINCHNODE_DEMO_BASE = "https://api.finchnode.com/demo/v1";
export const LIVE_LABEL = "Records retrieved live from FinchNode public demo API (synthetic patient)";
export const FALLBACK_LABEL = "FinchNode unreachable - using the saved copy of this synthetic patient";

export { caseRecords };
export interface DemoPullOptions { timeoutMs: number; retries: number }

const looksLikeSnapshot = (value: unknown, subject: string): value is FinchSnapshot => {
  const body = value as { id?: unknown; synthetic?: unknown; data?: unknown } | null;
  return Boolean(body && typeof body === "object" && body.id === subject && body.synthetic === true && body.data && typeof body.data === "object");
};

/**
 * Reads a FinchNode public demo patient's records over HTTPS at investigation time, keeps only the
 * records for the case's encounter window, and says honestly where they came from. If the network
 * call fails (timeout 8s, one retry), it falls back to the saved copy of that same synthetic patient
 * and labels the case as using the fallback; it never reports a live pull that did not happen.
 */
export class FinchNodeDemoProvider implements MedicalRecordProvider {
  constructor(
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly options: DemoPullOptions = { timeoutMs: 8000, retries: 1 },
    private readonly now: () => Date = () => new Date()
  ) {}

  private async pull(subject: string): Promise<FinchSnapshot> {
    const url = `${FINCHNODE_DEMO_BASE}/users/${encodeURIComponent(subject)}/records`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        const response = await this.fetcher(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(this.options.timeoutMs) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (!looksLikeSnapshot(body, subject)) throw new Error("unexpected response shape");
        return body;
      } catch (error) { lastError = error; }
    }
    throw lastError instanceof Error ? lastError : new Error("request failed");
  }

  async retrieve(transaction: Transaction): Promise<RetrievedRecords> {
    const subject = scenarioForTransaction(transaction)?.finchSubject;
    if (!subject) throw new Error("This payment is not tied to a FinchNode demo patient");
    let snapshot: FinchSnapshot;
    let live = true;
    let fallbackReason: string | undefined;
    try { snapshot = await this.pull(subject); }
    catch (error) {
      const saved = savedSnapshot(subject);
      if (!saved) throw new Error(`FinchNode demo API unreachable and no saved copy exists for ${subject}`);
      snapshot = saved; live = false;
      fallbackReason = `${error instanceof Error ? error.name === "TimeoutError" ? "timed out" : error.message : "request failed"}`;
    }
    const records = caseRecords(snapshot, transaction);
    const organization = records.find((record) => record.type === "encounter")?.provider.replace(/\s*\(synthetic\)\s*$/i, "");
    const source: RecordSource = { label: live ? LIVE_LABEL : FALLBACK_LABEL, live, tier: live ? "open-demo" : "saved-copy", subject, retrievedAt: this.now().toISOString(), organization, counts: countByCategory(records), ...(fallbackReason ? { fallbackReason } : {}) };
    return { records, source };
  }

  async getMedicalRecords(transaction: Transaction): Promise<MedicalRecord[]> { return (await this.retrieve(transaction)).records; }
}

/**
 * Demo-mode record source, best tier first, each labeled only for what actually happened:
 * (a) the authenticated, consented FinchNode sandbox patient when an API key is set and that patient
 * exists and is readable; (b) the keyless public demo API, with the reason the sandbox patient was not
 * used; (c) the saved copy, when FinchNode cannot be reached at all. The original University Hospital
 * rehearsal case has no FinchNode patient and keeps its scenario adapter.
 */
export class DemoMedicalProvider implements MedicalRecordProvider {
  constructor(
    private readonly finch: FinchNodeDemoProvider = new FinchNodeDemoProvider(),
    private readonly rehearsal: MedicalRecordProvider = new ScenarioFinchNodeProvider(),
    private readonly sandbox: FinchNodeSandboxProvider = new FinchNodeSandboxProvider()
  ) {}

  async retrieve(transaction: Transaction): Promise<RetrievedRecords> {
    if (!scenarioForTransaction(transaction)?.finchSubject) return { records: await this.rehearsal.getMedicalRecords(transaction), source: { label: SCENARIO_RECORDS_LABEL, live: false } };
    let sandboxNote: string;
    try { return await this.sandbox.retrieve(transaction); }
    catch (error) { sandboxNote = error instanceof SandboxUnavailable ? error.message : "the sandbox read failed unexpectedly"; }
    const lower = await this.finch.retrieve(transaction);
    return { records: lower.records, source: { ...lower.source, sandboxNote } };
  }
  async getMedicalRecords(transaction: Transaction): Promise<MedicalRecord[]> { return (await this.retrieve(transaction)).records; }
}
