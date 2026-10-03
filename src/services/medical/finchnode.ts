import type { MedicalRecord, Transaction } from "../../types/domain";
import type { MedicalRecordProvider } from "./provider";

type FinchEntry = { id?: string; name?: string; description?: string; title?: string; type?: string; date?: string; startDate?: string; createdDate?: string; issuedDate?: string; effectiveDate?: string; sourceName?: string };
type FinchSnapshot = { data?: Record<string, FinchEntry[] | undefined> };

/** Converts consent-filtered FinchNode records into only the clinical evidence needed for matching. */
export function normalizeFinchRecords(snapshot: FinchSnapshot): MedicalRecord[] {
  const categories: Array<[string, MedicalRecord["type"]]> = [["encounters", "encounter"], ["medications", "medication"], ["medicationAdministrations", "medication"], ["labs", "lab"], ["diagnosticReports", "document"], ["documents", "document"]];
  return categories.flatMap(([category, type]) => (snapshot.data?.[category] ?? []).flatMap((entry) => {
    const date = (entry.date || entry.startDate || entry.effectiveDate || entry.createdDate || entry.issuedDate || "").slice(0, 10);
    const description = entry.description || entry.name || entry.title || (type === "encounter" ? entry.type : undefined);
    if (!entry.id || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [{ id: entry.id, type, description, date, provider: entry.sourceName || "Unknown provider" }];
  }));
}

export class FinchNodeProvider implements MedicalRecordProvider {
  /** Reads a patient-consented snapshot from FinchNode's documented records endpoint. */
  async getMedicalRecords(_transaction: Transaction): Promise<MedicalRecord[]> {
    const key = process.env.FINCHNODE_API_KEY;
    const subject = process.env.FINCHNODE_SUBJECT;
    if (!key || !subject) throw new Error("FinchNode key and consented subject are required");
    const base = process.env.FINCHNODE_BASE_URL || "https://api.finchnode.com/api/v1";
    const url = new URL(`${base.replace(/\/$/, "")}/users/${encodeURIComponent(subject)}/records`);
    if (url.protocol !== "https:") throw new Error("FinchNode requires HTTPS");
    url.searchParams.set("categories", "encounters,medications,labs,documents,claims");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`FinchNode records request failed: ${response.status}`);
    return normalizeFinchRecords(await response.json() as FinchSnapshot);
  }
}
