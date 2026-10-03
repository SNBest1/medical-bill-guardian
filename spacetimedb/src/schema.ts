import { schema, table, t } from "spacetimedb/server";

const Resolution = t.object("Resolution", { result: t.string(), originalTotalCents: t.i64(), correctedTotalCents: t.i64(), adjustmentCents: t.i64(), explanation: t.string() });
const child = { id: t.u64().primaryKey().autoInc(), caseId: t.u64().index("btree"), owner: t.identity().index("btree") };

// Every table is private; clients read only through the per-owner views in index.ts.
export const billCase = table({ name: "bill_case" }, {
  id: t.u64().primaryKey().autoInc(), owner: t.identity().index("btree"), label: t.string(), status: t.string(),
  transactionId: t.string(), merchant: t.string(), amountCents: t.i64(), paidOn: t.string(),
  invoiceId: t.option(t.string()), billTotalCents: t.option(t.i64()), resolution: t.option(Resolution), summary: t.option(t.string()),
  createdAt: t.timestamp(), updatedAt: t.timestamp()
});
export const medicalRecord = table({ name: "medical_record" }, { ...child, kind: t.string(), description: t.string(), date: t.string(), provider: t.string() });
export const billItem = table({ name: "bill_item" }, { ...child, description: t.string(), code: t.option(t.string()), amountCents: t.i64(), serviceDate: t.string() });
export const finding = table({ name: "finding" }, { ...child, billItemId: t.option(t.u64()), description: t.string(), amountCents: t.i64(), clinicalStatus: t.string(), pricingStatus: t.string(), confidence: t.f64(), evidence: t.array(t.string()), explanation: t.string(), action: t.string() });
export const timelineEvent = table({ name: "timeline_event" }, { ...child, at: t.timestamp(), title: t.string(), detail: t.string(), source: t.string(), status: t.string() });
export const auditEntry = table({ name: "audit_entry" }, { ...child, at: t.timestamp(), action: t.string(), tool: t.string(), inputSummary: t.string(), outputSummary: t.string(), status: t.string() });
export const communication = table({ name: "communication" }, { ...child, kind: t.string(), at: t.timestamp(), status: t.string(), transcript: t.string(), result: t.option(t.string()) });
export const billDelivery = table({ name: "bill_delivery" }, { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), caseId: t.u64().index("btree") });

const spacetimedb = schema({ billCase, medicalRecord, billItem, finding, timelineEvent, auditEntry, communication, billDelivery });
export default spacetimedb;
