import { ScheduleAt } from "spacetimedb";
import { SenderError, t, type InferSchema, type ReducerCtx } from "spacetimedb/server";
import spacetimedb, { auditEntry, billCase, billDelivery, billItem, communication, finding, medicalRecord, timelineEvent } from "./schema";
import { BILL_DELAY_MICROS, DEMO_CASE_LABEL, DEMO_RECORDS, DEMO_STATEMENT, DEMO_TRANSACTION, billRequestTranscript, billingReview, notificationTranscript } from "./logic/fixtures";
import { matchEncounter } from "./logic/matcher";
import { formatDollars } from "./logic/money";
import { parseItemizedBill } from "./logic/parse-bill";
import { reconcile } from "./logic/reconcile";
import { buildSummary } from "./logic/summary";
import type { CaseStatus, RecordKind, ResolutionInput } from "./logic/types";

export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type CaseRow = NonNullable<ReturnType<Ctx["db"]["billCase"]["id"]["find"]>>;
type Step = { action: string; tool: string; input: string; output: string; title: string; detail: string; source: string };

/** Loads a case and rejects callers who do not own it. */
function ownedCase(ctx: Ctx, caseId: bigint): CaseRow {
  const row = ctx.db.billCase.id.find(caseId);
  if (!row || !row.owner.equals(ctx.sender)) throw new SenderError("Case not found");
  return row;
}

/** Writes the status change and stamps updatedAt in one place. */
function setStatus(ctx: Ctx, row: CaseRow, status: CaseStatus, changes: Partial<CaseRow> = {}): CaseRow {
  const next = { ...row, ...changes, status, updatedAt: ctx.timestamp };
  ctx.db.billCase.id.update(next);
  return next;
}

/** Records one controlled tool step in both the audit log and the patient-facing timeline. */
function logStep(ctx: Ctx, row: CaseRow, step: Step) {
  const base = { id: 0n, caseId: row.id, owner: row.owner, at: ctx.timestamp };
  ctx.db.auditEntry.insert({ ...base, action: step.action, tool: step.tool, inputSummary: step.input, outputSummary: step.output, status: "SUCCESS" });
  ctx.db.timelineEvent.insert({ ...base, title: step.title, detail: step.detail, source: step.source, status: "complete" });
}

/** Resolved → summary → in-app notification → USER_NOTIFIED. */
function finishCase(ctx: Ctx, row: CaseRow) {
  const resolved = setStatus(ctx, row, "RESOLVED");
  const findings = [...ctx.db.finding.caseId.filter(row.id)];
  const summary = buildSummary({
    provider: row.merchant,
    supported: findings.filter((item) => item.clinicalStatus === "SUPPORTED").length,
    questioned: findings.filter((item) => item.action === "REQUEST_REVIEW").map((item) => ({ description: item.description, amountCents: Number(item.amountCents) })),
    resolution: resolved.resolution ? { ...resolved.resolution, result: resolved.resolution.result as ResolutionInput["result"], originalTotalCents: Number(resolved.resolution.originalTotalCents), correctedTotalCents: Number(resolved.resolution.correctedTotalCents), adjustmentCents: Number(resolved.resolution.adjustmentCents) } : null
  });
  const withSummary = setStatus(ctx, resolved, "RESOLVED", { summary });
  logStep(ctx, withSummary, { action: "GENERATE_SUMMARY", tool: "buildSummary", input: "Structured case facts", output: "Deterministic summary", title: "Plain-language summary prepared", detail: "Case outcome explained from verified facts", source: "Case agent" });
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "USER_NOTIFICATION", at: ctx.timestamp, status: "COMPLETED", transcript: notificationTranscript, result: summary });
  logStep(ctx, withSummary, { action: "NOTIFY_USER", tool: "notifyUser", input: row.label, output: "In-app summary recorded", title: "You were notified", detail: "Review summary added to your case", source: "Notification" });
  setStatus(ctx, withSummary, "USER_NOTIFIED");
}

/** Opens the caller's demo case once; repeated scans are no-ops. */
export const scan_demo_payment = spacetimedb.reducer((ctx) => {
  if ([...ctx.db.billCase.owner.filter(ctx.sender)].some((row) => row.transactionId === DEMO_TRANSACTION.id)) return;
  const row = ctx.db.billCase.insert({
    id: 0n, owner: ctx.sender, label: DEMO_CASE_LABEL, status: "DETECTED", transactionId: DEMO_TRANSACTION.id, merchant: DEMO_TRANSACTION.merchant,
    amountCents: BigInt(DEMO_TRANSACTION.amountCents), paidOn: DEMO_TRANSACTION.date, invoiceId: undefined, billTotalCents: undefined, resolution: undefined, summary: undefined,
    createdAt: ctx.timestamp, updatedAt: ctx.timestamp
  });
  logStep(ctx, row, { action: "CREATE_CASE", tool: "getTransaction", input: DEMO_TRANSACTION.id, output: "Case opened", title: "Hospital payment detected", detail: `${formatDollars(DEMO_TRANSACTION.amountCents)} payment to ${row.merchant}`, source: "Bank transaction" });
});

/** Retrieves records, requests the bill, and schedules the mock statement's arrival. */
export const investigate_case = spacetimedb.reducer({ caseId: t.u64() }, (ctx, { caseId }) => {
  const row = ownedCase(ctx, caseId);
  if (row.status !== "DETECTED") return;
  for (const record of DEMO_RECORDS) ctx.db.medicalRecord.insert({ id: 0n, caseId: row.id, owner: row.owner, ...record });
  logStep(ctx, row, { action: "FETCH_RECORDS", tool: "getMedicalRecords", input: row.paidOn, output: `${DEMO_RECORDS.length} records`, title: "Medical records retrieved", detail: `${DEMO_RECORDS.length} relevant records found near the payment date`, source: "Medical record" });
  const encounter = matchEncounter({ merchant: row.merchant, date: row.paidOn }, DEMO_RECORDS);
  if (encounter) logStep(ctx, row, { action: "MATCH_ENCOUNTER", tool: "matchEncounter", input: row.merchant, output: encounter.description, title: "Medical encounter located", detail: `${encounter.description} · ${encounter.date}`, source: "Medical record" });
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "ITEMIZED_BILL_REQUEST", at: ctx.timestamp, status: "PENDING", transcript: billRequestTranscript(row.merchant), result: "Awaiting itemized statement" });
  logStep(ctx, row, { action: "REQUEST_BILL", tool: "requestItemizedBill", input: row.merchant, output: "Bill request submitted", title: "Itemized bill requested", detail: "Waiting for the provider's statement", source: "Hospital billing" });
  ctx.db.billDelivery.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + BILL_DELAY_MICROS), caseId: row.id });
  setStatus(ctx, row, "WAITING_FOR_BILL");
});

/** Scheduler-only: delivers the statement, parses it, and reconciles each charge. */
export const deliver_bill = spacetimedb.reducer({ onSchedule: billDelivery }, { delivery: billDelivery.rowType }, (ctx, { delivery }) => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError("deliver_bill can only be run by the scheduler");
  const row = ctx.db.billCase.id.find(delivery.caseId);
  if (!row || row.status !== "WAITING_FOR_BILL") return;
  const bill = parseItemizedBill(DEMO_STATEMENT);
  const itemIds = bill.items.map((item) => ctx.db.billItem.insert({ id: 0n, caseId: row.id, owner: row.owner, description: item.description, code: item.code, amountCents: BigInt(item.amountCents), serviceDate: item.serviceDate }).id);
  for (const request of [...ctx.db.communication.caseId.filter(row.id)]) if (request.kind === "ITEMIZED_BILL_REQUEST") ctx.db.communication.id.update({ ...request, status: "COMPLETED", result: `Invoice ${bill.invoiceId} received` });
  const withBill = setStatus(ctx, row, "ANALYZING", { invoiceId: bill.invoiceId, billTotalCents: BigInt(bill.totalCents) });
  logStep(ctx, withBill, { action: "RECEIVE_BILL", tool: "getItemizedBill", input: row.label, output: bill.invoiceId, title: "Itemized bill received", detail: `Statement for invoice ${bill.invoiceId}`, source: "Hospital billing" });
  logStep(ctx, withBill, { action: "PARSE_BILL", tool: "parseItemizedBill", input: bill.invoiceId, output: `${bill.items.length} charges`, title: "Itemized bill parsed", detail: `${bill.items.length} charges extracted from the provider statement`, source: "Case agent" });
  const records = [...ctx.db.medicalRecord.caseId.filter(row.id)].map((record) => ({ ...record, kind: record.kind as RecordKind }));
  const results = reconcile(bill, records);
  for (const item of results) ctx.db.finding.insert({ id: 0n, caseId: row.id, owner: row.owner, billItemId: item.lineIndex === null ? undefined : itemIds[item.lineIndex], description: item.description, amountCents: BigInt(item.amountCents), clinicalStatus: item.clinicalStatus, pricingStatus: item.pricingStatus, confidence: item.confidence, evidence: item.evidence, explanation: item.explanation, action: item.action });
  const supported = results.filter((item) => item.clinicalStatus === "SUPPORTED").length;
  const review = results.filter((item) => item.action === "REQUEST_REVIEW").length;
  logStep(ctx, withBill, { action: "RECONCILE", tool: "compareBillToRecords", input: `${bill.items.length} charges`, output: `${supported} supported, ${review} need review`, title: "Bill analyzed", detail: `${supported} supported · ${review} requires review`, source: "Reconciliation engine" });
  if (!review) return finishCase(ctx, withBill);
  ctx.db.timelineEvent.insert({ id: 0n, caseId: row.id, owner: row.owner, at: ctx.timestamp, title: "Your approval is needed", detail: "Review the uncertain charge before contacting hospital billing", source: "You", status: "attention" });
  setStatus(ctx, withBill, "REVIEW_REQUIRED");
});

/** The only path to provider contact: the case owner explicitly authorizes billing review. */
export const authorize_review = spacetimedb.reducer({ caseId: t.u64() }, (ctx, { caseId }) => {
  const row = ownedCase(ctx, caseId);
  if (row.status !== "REVIEW_REQUIRED" || !row.invoiceId) throw new SenderError("Case is not ready for billing review");
  for (const event of [...ctx.db.timelineEvent.caseId.filter(row.id)]) if (event.status === "attention") ctx.db.timelineEvent.id.update({ ...event, status: "complete", title: "You authorized billing review", detail: "Hospital billing may now verify the questioned charge" });
  const questioned = [...ctx.db.finding.caseId.filter(row.id)].filter((item) => item.action === "REQUEST_REVIEW");
  const { transcript, resolution } = billingReview(row.merchant, row.invoiceId, questioned[0]?.description ?? "questioned");
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "BILLING_REVIEW", at: ctx.timestamp, status: "COMPLETED", transcript, result: resolution.explanation });
  const resolved = setStatus(ctx, row, "CONTACTING_PROVIDER", { resolution: { result: resolution.result, originalTotalCents: BigInt(resolution.originalTotalCents), correctedTotalCents: BigInt(resolution.correctedTotalCents), adjustmentCents: BigInt(resolution.adjustmentCents), explanation: resolution.explanation } });
  logStep(ctx, resolved, { action: "REQUEST_REVIEW", tool: "requestBillingReview", input: `${questioned.length} findings`, output: resolution.result, title: "Hospital billing responded", detail: resolution.explanation, source: "Hospital billing" });
  finishCase(ctx, resolved);
});

/** Deletes every row the caller owns, including a pending bill delivery. */
export const reset_demo = spacetimedb.reducer((ctx) => {
  for (const row of [...ctx.db.billCase.owner.filter(ctx.sender)]) {
    for (const delivery of [...ctx.db.billDelivery.caseId.filter(row.id)]) ctx.db.billDelivery.scheduledId.delete(delivery.scheduledId);
    ctx.db.billCase.id.delete(row.id);
  }
  for (const item of [...ctx.db.medicalRecord.owner.filter(ctx.sender)]) ctx.db.medicalRecord.id.delete(item.id);
  for (const item of [...ctx.db.billItem.owner.filter(ctx.sender)]) ctx.db.billItem.id.delete(item.id);
  for (const item of [...ctx.db.finding.owner.filter(ctx.sender)]) ctx.db.finding.id.delete(item.id);
  for (const item of [...ctx.db.timelineEvent.owner.filter(ctx.sender)]) ctx.db.timelineEvent.id.delete(item.id);
  for (const item of [...ctx.db.auditEntry.owner.filter(ctx.sender)]) ctx.db.auditEntry.id.delete(item.id);
  for (const item of [...ctx.db.communication.owner.filter(ctx.sender)]) ctx.db.communication.id.delete(item.id);
});

// Public, per-caller views are the only way clients read data; every table above is private.
export const my_cases = spacetimedb.view({ name: "my_cases", public: true }, t.array(billCase.rowType), (ctx) => [...ctx.db.billCase.owner.filter(ctx.sender)]);
export const my_medical_records = spacetimedb.view({ name: "my_medical_records", public: true }, t.array(medicalRecord.rowType), (ctx) => [...ctx.db.medicalRecord.owner.filter(ctx.sender)]);
export const my_bill_items = spacetimedb.view({ name: "my_bill_items", public: true }, t.array(billItem.rowType), (ctx) => [...ctx.db.billItem.owner.filter(ctx.sender)]);
export const my_findings = spacetimedb.view({ name: "my_findings", public: true }, t.array(finding.rowType), (ctx) => [...ctx.db.finding.owner.filter(ctx.sender)]);
export const my_timeline = spacetimedb.view({ name: "my_timeline", public: true }, t.array(timelineEvent.rowType), (ctx) => [...ctx.db.timelineEvent.owner.filter(ctx.sender)]);
export const my_audit_log = spacetimedb.view({ name: "my_audit_log", public: true }, t.array(auditEntry.rowType), (ctx) => [...ctx.db.auditEntry.owner.filter(ctx.sender)]);
export const my_communications = spacetimedb.view({ name: "my_communications", public: true }, t.array(communication.rowType), (ctx) => [...ctx.db.communication.owner.filter(ctx.sender)]);
