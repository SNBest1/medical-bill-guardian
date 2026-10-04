import type { Timestamp } from "spacetimedb";
import type * as Row from "../module_bindings/types";
import type { AuditEntry, CaseStatus, ClinicalStatus, Communication, MedicalBillCase, MedicalRecord, Resolution, TimelineEvent } from "../types/domain";

export type ViewRows = { cases: readonly Row.BillCase[]; records: readonly Row.MedicalRecord[]; billItems: readonly Row.BillItem[]; findings: readonly Row.Finding[]; timeline: readonly Row.TimelineEvent[]; audit: readonly Row.AuditEntry[]; communications: readonly Row.Communication[] };

const dollars = (cents: bigint) => Number(cents) / 100;
const iso = (at: Timestamp) => new Date(Number(at.microsSinceUnixEpoch / 1000n)).toISOString();
// Rows written in one transaction share a timestamp; the auto-increment id preserves their order.
const byInsertion = <T extends { id: bigint }>(rows: readonly T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Reassembles view rows into the display shape the components already use. Status strings are written only from typed unions in the module. */
export function assembleCases(rows: ViewRows): MedicalBillCase[] {
  return byInsertion(rows.cases).map((row) => {
    const mine = <T extends { caseId: bigint; id: bigint }>(list: readonly T[]) => byInsertion(list.filter((item) => item.caseId === row.id));
    const resolution: Resolution | null = row.resolution ? { result: row.resolution.result as Resolution["result"], originalTotal: dollars(row.resolution.originalTotalCents), correctedTotal: dollars(row.resolution.correctedTotalCents), adjustment: dollars(row.resolution.adjustmentCents), explanation: row.resolution.explanation } : null;
    return {
      id: row.id.toString(), label: row.label, status: row.status as CaseStatus,
      transaction: { id: row.transactionId, merchant: row.merchant, amount: dollars(row.amountCents), date: row.paidOn },
      provider: { name: row.merchant },
      medicalRecords: mine(rows.records).map((item): MedicalRecord => ({ id: item.id.toString(), type: item.kind as MedicalRecord["type"], description: item.description, date: item.date, provider: item.provider })),
      bill: row.invoiceId && row.billTotalCents !== undefined ? { invoiceId: row.invoiceId, provider: row.merchant, total: dollars(row.billTotalCents), items: mine(rows.billItems).map((item) => ({ id: item.id.toString(), description: item.description, code: item.code, amount: dollars(item.amountCents), serviceDate: item.serviceDate })) } : null,
      findings: mine(rows.findings).map((item) => ({ billItemId: item.billItemId?.toString() ?? "bill-total", description: item.description, amount: dollars(item.amountCents), clinicalStatus: item.clinicalStatus as ClinicalStatus, pricingStatus: item.pricingStatus as "NOT_ASSESSED" | "REVIEW", confidence: item.confidence, evidence: [...item.evidence], explanation: item.explanation, action: item.action as "NONE" | "REQUEST_REVIEW" })),
      communications: mine(rows.communications).map((item): Communication => ({ id: item.id.toString(), type: item.kind as Communication["type"], timestamp: iso(item.at), status: item.status as Communication["status"], transcript: item.transcript, result: item.result })),
      timeline: mine(rows.timeline).map((item): TimelineEvent => ({ id: item.id.toString(), timestamp: iso(item.at), title: item.title, detail: item.detail, source: item.source, status: item.status as TimelineEvent["status"] })),
      auditLog: mine(rows.audit).map((item): AuditEntry => ({ id: item.id.toString(), timestamp: iso(item.at), action: item.action, tool: item.tool, inputSummary: item.inputSummary, outputSummary: item.outputSummary, status: item.status as AuditEntry["status"] })),
      resolution, summary: row.summary ?? null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt)
    };
  });
}
