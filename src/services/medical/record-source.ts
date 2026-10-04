import type { RecordSource } from "../../types/domain";

/** FinchNode category -> [singular, plural] wording for the Records panel and the audit log. */
export const CATEGORY_NAMES: Record<string, [string, string]> = {
  encounters: ["encounter", "encounters"],
  diagnosticReports: ["diagnostic report", "diagnostic reports"],
  labs: ["lab result", "lab results"],
  medicationAdministrations: ["medication administered", "medications administered"],
  medications: ["medication on record", "medications on record"],
  vitals: ["vital sign", "vital signs"],
  documents: ["document", "documents"],
  procedures: ["procedure", "procedures"]
};

export const categoryLabel = (category: string, count: number): string => {
  const names = CATEGORY_NAMES[category];
  return names ? names[count === 1 ? 0 : 1] : category;
};

/** "1 encounter, 1 diagnostic report, 6 lab results" in a stable display order. */
export function describeCounts(counts: Record<string, number> | undefined): string {
  const order = Object.keys(CATEGORY_NAMES);
  return Object.entries(counts ?? {})
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([category, count]) => `${count} ${categoryLabel(category, count)}`)
    .join(", ");
}

/** Fixed-format UTC time so server and browser render the same text. */
export const clock = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";

/** One honest sentence for the case audit log and timeline: what was read, from where, and when. */
export function describeRecordSource(source: RecordSource, total: number): string {
  const parts = [`${total} records. ${source.label}`];
  if (source.subject) parts.push(`subject ${source.subject}`);
  if (source.retrievedAt) parts.push(`${source.live ? "retrieved" : "saved copy read"} ${clock(source.retrievedAt)}`);
  const counts = describeCounts(source.counts);
  if (counts) parts.push(counts);
  if (source.fallbackReason) parts.push(`reason: ${source.fallbackReason}`);
  return parts.join(" · ");
}
