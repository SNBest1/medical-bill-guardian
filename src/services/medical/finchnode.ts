import type { MedicalRecord, Transaction } from "../../types/domain";
import type { MedicalRecordProvider } from "./provider";

type FinchEntry = { id?: string; name?: string; description?: string; title?: string; type?: string; date?: string; startDate?: string; createdDate?: string; issuedDate?: string; effectiveDate?: string; sourceName?: string; category?: string };
export type FinchSnapshot = { data?: Record<string, FinchEntry[] | undefined> };

/** FinchNode categories this app reads as clinical evidence, in display order. Claims are deliberately absent. */
export const EVIDENCE_CATEGORIES = ["encounters", "diagnosticReports", "labs", "medicationAdministrations", "medications", "vitals", "documents", "procedures"] as const;

/** The consented subject is missing or not yet resolved from a completed Connect session. */
export class FinchNodeConfigError extends Error {}
/** The patient revoked or let expire the consent that authorized this read (FinchNode 410 consent_inactive). */
export class FinchNodeConsentError extends Error {}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

/** Converts consent-filtered FinchNode records into only the clinical evidence needed for matching. Claims are never included: they are billing artifacts, not proof of care. */
export function normalizeFinchRecords(snapshot: FinchSnapshot): MedicalRecord[] {
  const categories: Array<[string, MedicalRecord["type"]]> = [["encounters", "encounter"], ["medications", "medication"], ["medicationAdministrations", "medication"], ["labs", "lab"], ["diagnosticReports", "document"], ["documents", "document"], ["procedures", "procedure"], ["vitals", "vital"]];
  return categories.flatMap(([category, defaultType]) => (snapshot.data?.[category] ?? []).flatMap((entry) => {
    // A diagnostic report that FinchNode categorizes as imaging/radiology is imaging evidence; a laboratory report is lab evidence.
    const reportKind = category === "diagnosticReports" ? entry.category ?? "" : "";
    const type: MedicalRecord["type"] = /^(imaging|radiology)$/i.test(reportKind) ? "imaging" : /^(laboratory|chemistry|hematology|pathology)$/i.test(reportKind) ? "lab" : defaultType;
    const date = (entry.date || entry.startDate || entry.effectiveDate || entry.createdDate || entry.issuedDate || "").slice(0, 10);
    const description = entry.description || entry.name || entry.title || (type === "encounter" ? entry.type : undefined);
    if (!entry.id || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [{ id: entry.id, type, description, date, provider: entry.sourceName || "Unknown provider", category }];
  }));
}

/**
 * A FinchNode subject can carry years of unrelated history. Only records whose provider
 * matches the paid merchant and whose date falls in the same pre-payment window used to
 * match the encounter itself (see matchEncounter in reconciliation/matcher.ts) may be
 * attached as evidence for this case — otherwise an unrelated visit could be mistaken for
 * support (or contradiction) of a charge it has nothing to do with.
 */
export function matchesEncounterContext(record: MedicalRecord, transaction: Transaction): boolean {
  const merchant = normalize(transaction.merchant);
  const provider = normalize(record.provider);
  const paid = Date.parse(`${transaction.date}T00:00:00Z`);
  const recordDate = Date.parse(`${record.date}T00:00:00Z`);
  if (Number.isNaN(paid) || Number.isNaN(recordDate)) return false;
  const daysBeforePayment = (paid - recordDate) / 86400000;
  return (provider.includes(merchant) || merchant.includes(provider)) && daysBeforePayment >= 0 && daysBeforePayment <= 14;
}

/**
 * Same provider rule as matchesEncounterContext, but the record must fall within `days` of the
 * service date on either side. Used for FinchNode demo patients, where the payment date is the
 * service date and a patient's other visits (years of history) must never count as evidence.
 */
export function matchesServiceWindow(record: MedicalRecord, merchant: string, serviceDate: string, days = 1): boolean {
  const paid = Date.parse(`${serviceDate}T00:00:00Z`);
  const recordDate = Date.parse(`${record.date}T00:00:00Z`);
  if (Number.isNaN(paid) || Number.isNaN(recordDate)) return false;
  const name = normalize(merchant);
  const provider = normalize(record.provider);
  return (provider.includes(name) || name.includes(provider)) && Math.abs(paid - recordDate) / 86400000 <= days;
}

export class FinchNodeProvider implements MedicalRecordProvider {
  /**
   * Reads a patient-consented snapshot from FinchNode's documented records endpoint, then
   * narrows it to the encounter this case is about. The subject must come from a completed
   * Connect session's own response (`simulation.state === "completed"` → `subject`) — never
   * from `GET /users`, which lists active shares for admin/reconciliation and will not
   * resolve the patient behind a session that is still syncing. See
   * docs/FINCHNODE_HANDOFF.md for the current sandbox session status and how to resolve it.
   */
  async getMedicalRecords(transaction: Transaction): Promise<MedicalRecord[]> {
    const key = process.env.FINCHNODE_API_KEY;
    const subject = process.env.FINCHNODE_SUBJECT;
    if (!key || !subject) throw new FinchNodeConfigError("FinchNode key and a consented subject (from a completed Connect session) are required");
    const base = process.env.FINCHNODE_BASE_URL || "https://api.finchnode.com/api/v1";
    const url = new URL(`${base.replace(/\/$/, "")}/users/${encodeURIComponent(subject)}/records`);
    if (url.protocol !== "https:") throw new Error("FinchNode requires HTTPS");
    url.searchParams.set("categories", "encounters,medications,labs,documents,claims");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (response.status === 410) throw new FinchNodeConsentError("FinchNode consent for this subject is no longer active (revoked or expired)");
    if (!response.ok) throw new Error(`FinchNode records request failed: ${response.status}`);
    const records = normalizeFinchRecords(await response.json() as FinchSnapshot);
    return records.filter((record) => matchesEncounterContext(record, transaction));
  }
}
