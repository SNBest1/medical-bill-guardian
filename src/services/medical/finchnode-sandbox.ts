import type { MedicalRecord, RecordSource, Transaction } from "../../types/domain";
import { scenarioForTransaction } from "../scenarios";
import type { FinchSnapshot } from "./finchnode";
import { caseRecords, countByCategory } from "./record-window";
import type { MedicalRecordProvider, RetrievedRecords } from "./provider";

export const sandboxLabel = (consentedAt: string) => `Retrieved live from FinchNode sandbox with patient consent (synthetic patient, consent recorded ${consentedAt})`;

/** The authenticated sandbox patient cannot be used right now. The message is fixed text and never contains the key, a URL, or a response body. */
export class SandboxUnavailable extends Error {}

export interface SandboxOptions { timeoutMs: number; cacheTtlMs: number; maxPages: number; retryAfterCapMs: number }
const DEFAULTS: SandboxOptions = { timeoutMs: 8000, cacheTtlMs: 60_000, maxPages: 10, retryAfterCapMs: 5000 };

type SandboxUser = { id?: string; consentedAt?: string; sources?: Array<{ organization?: string }> };
type Page = { data?: unknown; hasMore?: boolean; nextCursor?: string | null };
const cache = new Map<string, { id: string; consentedAt: string; at: number }>();
/** Test hook and consent-change hook: forget remembered patient IDs. */
export const clearSandboxCache = () => cache.clear();

/** The user whose source organization carries this persona label, newest consent first. */
export function matchSandboxUser(users: SandboxUser[], label: string): { id: string; consentedAt: string } | undefined {
  const wanted = label.trim().toLowerCase();
  return users
    .filter((user) => user.id && (user.sources ?? []).some((source) => (source.organization ?? "").toLowerCase().split(" · ").some((part) => part.trim() === wanted)))
    .map((user) => ({ id: user.id!, consentedAt: user.consentedAt ?? "" }))
    .sort((a, b) => b.consentedAt.localeCompare(a.consentedAt))[0];
}

/**
 * Reads a consented FinchNode sandbox patient with the app's API key. The patient's user ID is never
 * accepted from a request: it is found by matching the scenario's persona label against GET /users.
 * Any problem throws SandboxUnavailable so the caller can fall back to a lower, honestly labeled tier.
 */
export class FinchNodeSandboxProvider implements MedicalRecordProvider {
  constructor(
    private readonly env: () => Record<string, string | undefined> = () => process.env,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly now: () => Date = () => new Date(),
    private readonly options: SandboxOptions = DEFAULTS,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  private config() {
    const env = this.env();
    const key = env.FINCHNODE_API_KEY?.trim();
    if (!key) throw new SandboxUnavailable("no FinchNode API key is configured");
    const base = (env.FINCHNODE_BASE_URL?.trim() || "https://api.finchnode.com/api/v1").replace(/\/$/, "");
    if (!base.startsWith("https://")) throw new SandboxUnavailable("FINCHNODE_BASE_URL must be https");
    return { key, base };
  }

  private async get(url: URL, key: string, what: string, forget?: () => void): Promise<Page & Record<string, unknown>> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try { response = await this.fetcher(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(this.options.timeoutMs) }); }
      catch (error) { throw new SandboxUnavailable(error instanceof Error && error.name === "TimeoutError" ? `the sandbox ${what} request timed out` : `the sandbox ${what} request could not reach FinchNode`); }
      if (response.ok) {
        try { return await response.json() as Page & Record<string, unknown>; } catch { throw new SandboxUnavailable(`the sandbox ${what} response was not readable`); }
      }
      if (response.status === 429 && attempt === 0) {
        const seconds = Number(response.headers.get("Retry-After"));
        await this.sleep(Math.min(Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000, this.options.retryAfterCapMs));
        continue;
      }
      if (response.status === 404 || response.status === 410) forget?.();
      throw new SandboxUnavailable(({
        401: "FinchNode rejected the API key",
        403: "the patient's consent does not allow this read",
        404: "the sandbox patient no longer exists",
        410: "the patient's consent is no longer active (revoked or expired)",
        429: "FinchNode is rate limiting reads"
      } as Record<number, string>)[response.status] ?? (response.status >= 500 ? `FinchNode sandbox error (HTTP ${response.status})` : `FinchNode sandbox refused the ${what} request (HTTP ${response.status})`));
    }
  }

  private async resolve(label: string, base: string, key: string): Promise<{ id: string; consentedAt: string }> {
    const hit = cache.get(`${base}|${label}`);
    if (hit && this.now().getTime() - hit.at < this.options.cacheTtlMs) return hit;
    const users: SandboxUser[] = [];
    let cursor: string | null | undefined;
    for (let pages = 0; pages < this.options.maxPages; pages++) {
      const url = new URL(`${base}/users`);
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const page = await this.get(url, key, "patient list");
      if (Array.isArray(page.data)) users.push(...page.data as SandboxUser[]);
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
    const match = matchSandboxUser(users, label);
    if (!match) throw new SandboxUnavailable("the sandbox patient has not appeared yet (its Connect session is still syncing)");
    cache.set(`${base}|${label}`, { ...match, at: this.now().getTime() });
    return match;
  }

  async retrieve(transaction: Transaction): Promise<RetrievedRecords> {
    const scenario = scenarioForTransaction(transaction);
    if (!scenario?.finchSandboxLabel) throw new SandboxUnavailable("this payment has no sandbox patient");
    const { key, base } = this.config();
    const label = scenario.finchSandboxLabel;
    const patient = await this.resolve(label, base, key);
    const forget = () => cache.delete(`${base}|${label}`);

    // One records response carries every granted category; follow the cursor if FinchNode ever pages it.
    const data: Record<string, unknown[]> = {};
    let sources: Array<{ organization?: string }> = [];
    let cursor: string | null | undefined;
    for (let pages = 0; pages < this.options.maxPages; pages++) {
      const url = new URL(`${base}/users/${encodeURIComponent(patient.id)}/records`);
      if (cursor) url.searchParams.set("cursor", cursor);
      const page = await this.get(url, key, "records", forget);
      if (pages === 0) sources = Array.isArray(page.sources) ? page.sources as typeof sources : [];
      for (const [category, value] of Object.entries((page.data ?? {}) as Record<string, unknown>)) if (Array.isArray(value)) (data[category] ??= []).push(...value);
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }

    // Entries from the sandbox carry no sourceName; the organization is the first part of the source label ("Northstar Health System (Synthetic) · Baseline adult, age 38").
    const organization = (sources[0]?.organization ?? "").split(" · ")[0].trim();
    const snapshot: FinchSnapshot = { data: Object.fromEntries(Object.entries(data).map(([category, entries]) => [category, (entries as Array<Record<string, unknown>>).map((entry) => ({ ...entry, sourceName: (entry.sourceName as string | null) || organization || undefined }))])) as FinchSnapshot["data"] };
    const records: MedicalRecord[] = caseRecords(snapshot, transaction);
    if (!records.some((record) => record.type === "encounter")) throw new SandboxUnavailable("the sandbox patient has no encounter for this visit");
    const consentedAt = patient.consentedAt.slice(0, 10);
    const source: RecordSource = { label: sandboxLabel(consentedAt), live: true, tier: "sandbox", subject: patient.id, consentedAt, retrievedAt: this.now().toISOString(), organization: organization.replace(/\s*\(synthetic\)\s*$/i, "") || undefined, counts: countByCategory(records) };
    return { records, source };
  }

  async getMedicalRecords(transaction: Transaction): Promise<MedicalRecord[]> { return (await this.retrieve(transaction)).records; }
}
