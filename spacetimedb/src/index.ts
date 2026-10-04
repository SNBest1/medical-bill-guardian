import { ScheduleAt } from "spacetimedb";
import { SenderError, t, type InferSchema, type ReducerCtx } from "spacetimedb/server";
import spacetimedb, { auditEntry, billCase, billDelivery, billItem, communication, finding, insuranceSummary, medicalRecord, priceComparison, timelineEvent } from "./schema";
import { BILL_DELAY_MICROS, DEMO_CASE_LABEL, DEMO_RECORDS, DEMO_STATEMENT, DEMO_TRANSACTION, billRequestTranscript, billingReview } from "./logic/fixtures";
import { matchEncounter } from "./logic/matcher";
import { formatDollars } from "./logic/money";
import { parseItemizedBill } from "./logic/parse-bill";
import { reconcile } from "./logic/reconcile";
import { buildSummary } from "./logic/summary";
import type { CaseStatus, FindingInput, ParsedBill, RecordKind, ResolutionInput } from "./logic/types";
import { claimForInvoice, summarizeClaim } from "./logic/insurance";
import { comparePrices } from "./logic/pricing";
import { composeDispute } from "./logic/dispute";
import { PRICE_RATES, PRICE_SOURCE } from "./logic/price-references";

export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type CaseRow = NonNullable<ReturnType<Ctx["db"]["billCase"]["id"]["find"]>>;
type Step = { action: string; tool: string; input: string; output: string; title: string; detail: string; source: string };

/** Captures the publisher identity when a database is first created. */
export const init = spacetimedb.init((ctx) => {
  ctx.db.moduleOwner.insert({ ownerIdentity: ctx.sender });
});

/** Restricts server-side mail ingestion to the database publisher's token. */
function requireModuleOwner(ctx: Ctx) {
  if (!ctx.db.moduleOwner.ownerIdentity.find(ctx.sender)) throw new SenderError("Trusted worker identity required");
}

/** Finds an authorized request of the expected kind without exposing other cases. */
function communicationFor(ctx: Ctx, caseId: bigint, kind: string, status: string) {
  return [...ctx.db.communication.caseId.filter(caseId)].find((item) => item.kind === kind && item.status === status);
}

/** Rejects malformed or already handled provider message identifiers. */
function unseenMessage(ctx: Ctx, messageId: string): boolean {
  if (!messageId || messageId.length > 255 || /[\r\n]/.test(messageId)) throw new SenderError("Invalid message ID");
  return !ctx.db.processedEmail.messageId.find(messageId);
}

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
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "USER_NOTIFICATION", at: ctx.timestamp, status: "COMPLETED", transcript: "In-app case summary", result: summary, messageId: undefined });
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

/** Opens a case from a trusted connector for the identity it verified upstream. */
export const ingest_external_case = spacetimedb.reducer({
  ownerIdentity: t.identity(), transactionId: t.string(), merchant: t.string(), amountCents: t.i64(), paidOn: t.string(),
  transactionSource: t.string(), recordsSource: t.string(),
  records: t.array(t.object("ExternalMedicalRecord", { kind: t.string(), description: t.string(), date: t.string(), provider: t.string() }))
}, (ctx, { ownerIdentity, transactionId, merchant, amountCents, paidOn, transactionSource, recordsSource, records }) => {
  requireModuleOwner(ctx);
  if (!transactionId || !merchant || amountCents <= 0n || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new SenderError("Invalid transaction");
  if (!["NESSIE_SANDBOX", "MOCK"].includes(transactionSource) || !["FINCHNODE_SANDBOX", "MOCK", "NONE"].includes(recordsSource)) throw new SenderError("Invalid connector source");
  if ([...ctx.db.billCase.owner.filter(ownerIdentity)].some((item) => item.transactionId === transactionId)) return;
  const row = ctx.db.billCase.insert({
    id: 0n, owner: ownerIdentity, label: merchant, status: "DETECTED", transactionId, merchant, amountCents, paidOn,
    invoiceId: undefined, billTotalCents: undefined, resolution: undefined, summary: undefined, createdAt: ctx.timestamp, updatedAt: ctx.timestamp
  });
  for (const record of records) {
    if (!record.description || !record.provider || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !["encounter", "imaging", "procedure", "medication", "lab", "document"].includes(record.kind)) throw new SenderError("Invalid medical record");
    ctx.db.medicalRecord.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: record.kind, description: record.description, date: record.date, provider: record.provider });
  }
  logStep(ctx, row, { action: "CREATE_CASE", tool: "ingestExternalCase", input: transactionSource, output: "Case opened", title: "Healthcare payment detected", detail: `${formatDollars(Number(amountCents))} payment to ${merchant} (${transactionSource.toLowerCase().replace("_", " ")})`, source: transactionSource });
  logStep(ctx, row, { action: "FETCH_RECORDS", tool: "ingestExternalCase", input: recordsSource, output: `${records.length} records`, title: "Medical evidence loaded", detail: `${records.length} records from ${recordsSource.toLowerCase().replace("_", " ")}`, source: recordsSource });
});

/** Records the patient's authorization to request a bill by email. */
export const request_itemized_bill_email = spacetimedb.reducer({ caseId: t.u64() }, (ctx, { caseId }) => {
  const row = ownedCase(ctx, caseId);
  if (row.status !== "DETECTED") throw new SenderError("Case is not ready for an itemized bill request");
  const existing = [...ctx.db.medicalRecord.caseId.filter(caseId)];
  if (!existing.length && row.transactionId === DEMO_TRANSACTION.id) {
    for (const record of DEMO_RECORDS) ctx.db.medicalRecord.insert({ id: 0n, caseId, owner: row.owner, ...record });
    logStep(ctx, row, { action: "FETCH_RECORDS", tool: "mockMedicalRecords", input: row.paidOn, output: `${DEMO_RECORDS.length} synthetic records`, title: "Synthetic medical records loaded", detail: "Demo records only; no live clinical match is claimed", source: "Mock medical record" });
  }
  ctx.db.communication.insert({ id: 0n, caseId, owner: row.owner, kind: "EMAIL_ITEMIZED_BILL_REQUEST", at: ctx.timestamp, status: "PENDING", transcript: `Request an itemized statement from the configured billing contact for the ${row.merchant} case, including service dates, codes, charges, insurance adjustments, and patient responsibility.`, result: "Authorized; waiting for email delivery", messageId: undefined });
  logStep(ctx, row, { action: "AUTHORIZE_BILL_EMAIL", tool: "requestItemizedBillEmail", input: row.merchant, output: "Email authorized", title: "You authorized an itemized bill request", detail: "Waiting for email delivery", source: "You" });
  setStatus(ctx, row, "WAITING_FOR_BILL");
});

/** Retrieves records, requests the bill, and schedules the mock statement's arrival. */
export const investigate_case = spacetimedb.reducer({ caseId: t.u64() }, (ctx, { caseId }) => {
  const row = ownedCase(ctx, caseId);
  if (row.transactionId !== DEMO_TRANSACTION.id) throw new SenderError("Synthetic investigation is only available for the demo case");
  if (row.status !== "DETECTED") return;
  for (const record of DEMO_RECORDS) ctx.db.medicalRecord.insert({ id: 0n, caseId: row.id, owner: row.owner, ...record });
  logStep(ctx, row, { action: "FETCH_RECORDS", tool: "getMedicalRecords", input: row.paidOn, output: `${DEMO_RECORDS.length} records`, title: "Medical records retrieved", detail: `${DEMO_RECORDS.length} relevant records found near the payment date`, source: "Medical record" });
  const encounter = matchEncounter({ merchant: row.merchant, date: row.paidOn }, DEMO_RECORDS);
  if (encounter) logStep(ctx, row, { action: "MATCH_ENCOUNTER", tool: "matchEncounter", input: row.merchant, output: encounter.description, title: "Medical encounter located", detail: `${encounter.description} · ${encounter.date}`, source: "Medical record" });
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "ITEMIZED_BILL_REQUEST", at: ctx.timestamp, status: "PENDING", transcript: billRequestTranscript(row.merchant), result: "Awaiting itemized statement", messageId: undefined });
  logStep(ctx, row, { action: "REQUEST_BILL", tool: "requestItemizedBill", input: row.merchant, output: "Bill request submitted", title: "Itemized bill requested", detail: "Waiting for the provider's statement", source: "Hospital billing" });
  ctx.db.billDelivery.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + BILL_DELAY_MICROS), caseId: row.id });
  setStatus(ctx, row, "WAITING_FOR_BILL");
});

/** Saves a validated statement and compares its lines to available clinical records. */
function storeBill(ctx: Ctx, row: CaseRow, bill: ParsedBill) {
  const itemIds = bill.items.map((item) => ctx.db.billItem.insert({ id: 0n, caseId: row.id, owner: row.owner, description: item.description, code: item.code, amountCents: BigInt(item.amountCents), serviceDate: item.serviceDate }).id);
  for (const request of [...ctx.db.communication.caseId.filter(row.id)]) if (request.kind === "ITEMIZED_BILL_REQUEST" || request.kind === "EMAIL_ITEMIZED_BILL_REQUEST") ctx.db.communication.id.update({ ...request, status: "COMPLETED", result: `Invoice ${bill.invoiceId} received` });
  const withBill = setStatus(ctx, row, "ANALYZING", { invoiceId: bill.invoiceId, billTotalCents: BigInt(bill.totalCents) });
  logStep(ctx, withBill, { action: "RECEIVE_BILL", tool: "getItemizedBill", input: row.label, output: bill.invoiceId, title: "Itemized bill received", detail: `Statement for invoice ${bill.invoiceId}`, source: "Hospital billing" });
  logStep(ctx, withBill, { action: "PARSE_BILL", tool: "parseItemizedBill", input: bill.invoiceId, output: `${bill.items.length} charges`, title: "Itemized bill parsed", detail: `${bill.items.length} charges extracted from the provider statement`, source: "Case agent" });
  const records = [...ctx.db.medicalRecord.caseId.filter(row.id)].map((record) => ({ ...record, kind: record.kind as RecordKind }));
  const results = reconcile(bill, records);
  // Insurance: the adjudicated claim for this invoice, deducted from the bill.
  const claim = claimForInvoice(bill.invoiceId);
  if (claim) {
    const summary = summarizeClaim(claim, bill, Number(row.amountCents));
    ctx.db.insuranceSummary.caseId.delete(row.id);
    ctx.db.insuranceSummary.insert({ caseId: row.id, owner: row.owner, payer: summary.payer, plan: summary.plan, network: summary.network, claimStatus: summary.claimStatus, synthetic: summary.synthetic,
      billedCents: BigInt(summary.billedCents), allowedCents: BigInt(summary.allowedCents), contractualCents: BigInt(summary.contractualCents), insurerPaidCents: BigInt(summary.insurerPaidCents),
      deductibleCents: BigInt(summary.deductibleCents), copayCents: BigInt(summary.copayCents), coinsuranceCents: BigInt(summary.coinsuranceCents), noncoveredCents: BigInt(summary.noncoveredCents),
      patientResponsibilityCents: BigInt(summary.patientResponsibilityCents), possibleOverpaymentCents: BigInt(summary.possibleOverpaymentCents), status: summary.status, notes: summary.notes });
    logStep(ctx, withBill, { action: "APPLY_CLAIM", tool: "summarizeClaim", input: bill.invoiceId, output: `Patient owes ${formatDollars(summary.patientResponsibilityCents)}`, title: "Insurance claim applied", detail: `${summary.payer} allowed ${formatDollars(summary.allowedCents)}; synthetic claim amounts`, source: "Insurance claim" });
  }
  // Prices: only this provider's published rates apply.
  const comparisons = sameProvider(bill.provider, PRICE_SOURCE.provider) ? comparePrices(bill, claim, PRICE_RATES) : [];
  for (const comparison of comparisons) {
    const result = results.find((item) => item.lineIndex === comparison.lineIndex);
    if (!result) continue;
    result.pricingStatus = comparison.review ? "REVIEW" : "ASSESSED";
    if (comparison.review) result.action = "REQUEST_REVIEW";
  }
  for (const item of results) ctx.db.finding.insert({ id: 0n, caseId: row.id, owner: row.owner, billItemId: item.lineIndex === null ? undefined : itemIds[item.lineIndex], description: item.description, amountCents: BigInt(item.amountCents), clinicalStatus: item.clinicalStatus, pricingStatus: item.pricingStatus, confidence: item.confidence, evidence: item.evidence, explanation: item.explanation, action: item.action });
  for (const comparison of comparisons) ctx.db.priceComparison.insert({ id: 0n, caseId: row.id, owner: row.owner, billItemId: itemIds[comparison.lineIndex], referenceCents: BigInt(comparison.referenceCents), comparedCents: BigInt(comparison.comparedCents), comparedField: comparison.comparedField, multiple: comparison.multiple, basis: comparison.basis, sourceName: PRICE_SOURCE.name, sourceUrl: PRICE_SOURCE.url, asOf: PRICE_SOURCE.asOf, review: comparison.review });
  if (comparisons.length) logStep(ctx, withBill, { action: "COMPARE_PRICES", tool: "comparePrices", input: `${comparisons.length} published rates`, output: `${comparisons.filter((item) => item.review).length} price questions`, title: "Published prices compared", detail: `${PRICE_SOURCE.name}, as of ${PRICE_SOURCE.asOf}`, source: "Price transparency file" });
  const supported = results.filter((item) => item.clinicalStatus === "SUPPORTED").length;
  const review = results.filter((item) => item.action === "REQUEST_REVIEW").length;
  logStep(ctx, withBill, { action: "RECONCILE", tool: "compareBillToRecords", input: `${bill.items.length} charges`, output: `${supported} supported, ${review} need review`, title: "Bill analyzed", detail: `${supported} supported · ${review} requires review`, source: "Reconciliation engine" });
  if (!review) return finishCase(ctx, withBill);
  ctx.db.timelineEvent.insert({ id: 0n, caseId: row.id, owner: row.owner, at: ctx.timestamp, title: "Your approval is needed", detail: "Review the uncertain charge before contacting hospital billing", source: "You", status: "attention" });
  setStatus(ctx, withBill, "REVIEW_REQUIRED");
}

const normalizeProvider = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();
/** Published rates belong to one provider; a bill from anyone else is never compared with them. */
function sameProvider(a: string, b: string) { return normalizeProvider(a) === normalizeProvider(b); }

/** Scheduler-only: delivers the synthetic statement after a short delay. */
export const deliver_bill = spacetimedb.reducer({ onSchedule: billDelivery }, { delivery: billDelivery.rowType }, (ctx, { delivery }) => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError("deliver_bill can only be run by the scheduler");
  const row = ctx.db.billCase.id.find(delivery.caseId);
  if (!row || row.status !== "WAITING_FOR_BILL") return;
  storeBill(ctx, row, parseItemizedBill(DEMO_STATEMENT));
});

/** The only path to provider contact: the case owner explicitly authorizes billing review. */
export const authorize_review = spacetimedb.reducer({ caseId: t.u64() }, (ctx, { caseId }) => {
  const row = ownedCase(ctx, caseId);
  if (row.transactionId !== DEMO_TRANSACTION.id) throw new SenderError("Synthetic provider correction is only available for the demo case");
  if (row.status !== "REVIEW_REQUIRED" || !row.invoiceId) throw new SenderError("Case is not ready for billing review");
  for (const event of [...ctx.db.timelineEvent.caseId.filter(row.id)]) if (event.status === "attention") ctx.db.timelineEvent.id.update({ ...event, status: "complete", title: "You authorized billing review", detail: "Hospital billing may now verify the questioned charge" });
  const questioned = [...ctx.db.finding.caseId.filter(row.id)].filter((item) => item.action === "REQUEST_REVIEW");
  const { transcript, resolution } = billingReview(row.merchant, row.invoiceId, questioned[0]?.description ?? "questioned");
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "BILLING_REVIEW", at: ctx.timestamp, status: "COMPLETED", transcript, result: resolution.explanation, messageId: undefined });
  const resolved = setStatus(ctx, row, "CONTACTING_PROVIDER", { resolution: { result: resolution.result, originalTotalCents: BigInt(resolution.originalTotalCents), correctedTotalCents: BigInt(resolution.correctedTotalCents), adjustmentCents: BigInt(resolution.adjustmentCents), explanation: resolution.explanation } });
  logStep(ctx, resolved, { action: "REQUEST_REVIEW", tool: "requestBillingReview", input: `${questioned.length} findings`, output: resolution.result, title: "Hospital billing responded", detail: resolution.explanation, source: "Hospital billing" });
  finishCase(ctx, resolved);
});

/** Rebuilds the stored analysis and composes the cited dispute letter that the review email carries. */
function disputeText(ctx: Ctx, row: CaseRow): string {
  const byId = (a: { id: bigint }, b: { id: bigint }) => (a.id < b.id ? -1 : 1);
  const items = [...ctx.db.billItem.caseId.filter(row.id)].sort(byId);
  const lineOf = (billItemId: bigint | undefined) => (billItemId === undefined ? null : items.findIndex((item) => item.id === billItemId));
  const bill = { invoiceId: row.invoiceId ?? "", provider: row.merchant, totalCents: Number(row.billTotalCents ?? 0n), items: items.map((item) => ({ description: item.description, code: item.code, amountCents: Number(item.amountCents), serviceDate: item.serviceDate })) };
  const findings = [...ctx.db.finding.caseId.filter(row.id)].sort(byId).map((item) => ({ lineIndex: lineOf(item.billItemId), description: item.description, amountCents: Number(item.amountCents), clinicalStatus: item.clinicalStatus as FindingInput["clinicalStatus"], pricingStatus: item.pricingStatus as FindingInput["pricingStatus"], confidence: item.confidence, evidence: item.evidence, explanation: item.explanation, action: item.action as FindingInput["action"] }));
  const comparisons = [...ctx.db.priceComparison.caseId.filter(row.id)].map((item) => ({ lineIndex: lineOf(item.billItemId) ?? -1, referenceCents: Number(item.referenceCents), comparedCents: Number(item.comparedCents), comparedField: item.comparedField as "ALLOWED" | "BILLED", multiple: item.multiple, basis: item.basis as "CASH" | "NEGOTIATED", review: item.review }));
  const stored = ctx.db.insuranceSummary.caseId.find(row.id);
  const summary = stored ? { ...stored, billedCents: Number(stored.billedCents), allowedCents: Number(stored.allowedCents), contractualCents: Number(stored.contractualCents), insurerPaidCents: Number(stored.insurerPaidCents), deductibleCents: Number(stored.deductibleCents), copayCents: Number(stored.copayCents), coinsuranceCents: Number(stored.coinsuranceCents), noncoveredCents: Number(stored.noncoveredCents), patientResponsibilityCents: Number(stored.patientResponsibilityCents), possibleOverpaymentCents: Number(stored.possibleOverpaymentCents), status: stored.status as "RECONCILED" | "REVIEW_REQUIRED" } : null;
  return composeDispute({ caseLabel: row.label, bill, findings, comparisons, summary, paidCents: Number(row.amountCents), source: PRICE_SOURCE });
}

/** Records owner approval for an email review without inventing the provider's outcome. */
export const authorize_email_review = spacetimedb.reducer({ caseId: t.u64() }, (ctx, { caseId }) => {
  const row = ownedCase(ctx, caseId);
  if (row.status !== "REVIEW_REQUIRED" || !row.invoiceId) throw new SenderError("Case is not ready for billing review");
  const questioned = [...ctx.db.finding.caseId.filter(caseId)].filter((item) => item.action === "REQUEST_REVIEW");
  if (!questioned.length) throw new SenderError("No charge needs review");
  for (const event of [...ctx.db.timelineEvent.caseId.filter(caseId)]) if (event.status === "attention") ctx.db.timelineEvent.id.update({ ...event, status: "complete", title: "You authorized billing review", detail: "Provider review email is being prepared" });
  ctx.db.communication.insert({ id: 0n, caseId, owner: row.owner, kind: "EMAIL_BILLING_REVIEW", at: ctx.timestamp, status: "PENDING", transcript: disputeText(ctx, row), result: "Authorized; waiting for email delivery", messageId: undefined });
  logStep(ctx, row, { action: "AUTHORIZE_REVIEW_EMAIL", tool: "requestBillingReviewEmail", input: `${questioned.length} findings`, output: "Email authorized", title: "You authorized provider review", detail: "Waiting for email delivery", source: "You" });
  setStatus(ctx, row, "WAITING_FOR_PROVIDER");
});

/** Saves the Resend ID only after an authorized email was actually accepted. */
export const record_outbound_email = spacetimedb.reducer({ caseId: t.u64(), kind: t.string(), messageId: t.string() }, (ctx, { caseId, kind, messageId }) => {
  requireModuleOwner(ctx);
  if (!messageId || messageId.length > 255 || /[\r\n]/.test(messageId)) throw new SenderError("Invalid message ID");
  const existing = [...ctx.db.communication.iter()].find((item) => item.messageId === messageId);
  if (existing) {
    if (existing.caseId === caseId && existing.kind === kind && existing.status === "SENT") return;
    throw new SenderError("Message ID already belongs to another communication");
  }
  const row = ctx.db.billCase.id.find(caseId);
  if (!row || !((kind === "EMAIL_ITEMIZED_BILL_REQUEST" && row.status === "WAITING_FOR_BILL") || (kind === "EMAIL_BILLING_REVIEW" && row.status === "WAITING_FOR_PROVIDER"))) throw new SenderError("No authorized email request");
  const request = communicationFor(ctx, caseId, kind, "PENDING");
  if (!request) throw new SenderError("No pending email request");
  ctx.db.communication.id.update({ ...request, status: "SENT", result: "Email accepted by provider delivery service", messageId });
  logStep(ctx, row, { action: "SEND_EMAIL", tool: "Resend", input: kind, output: "Delivery accepted", title: "Email sent to provider billing", detail: "Waiting for a reply at the case mailbox", source: "Email service" });
});

/** Sends that fail this many times are dead-lettered: marked FAILED and surfaced to the patient. */
const MAX_SEND_ATTEMPTS = 3;

/** Records a failed send; after MAX_SEND_ATTEMPTS the request stops retrying and the patient is told. */
export const record_outbound_failure = spacetimedb.reducer({ communicationId: t.u64(), error: t.string() }, (ctx, { communicationId, error }) => {
  requireModuleOwner(ctx);
  const request = ctx.db.communication.id.find(communicationId);
  if (!request || request.status !== "PENDING" || !request.kind.startsWith("EMAIL_")) return;
  const reason = error.replace(/[\r\n]+/g, " ").slice(0, 300);
  const previous = ctx.db.outboundAttempt.communicationId.find(communicationId);
  const attempts = (previous?.attempts ?? 0) + 1;
  if (previous) ctx.db.outboundAttempt.communicationId.update({ communicationId, attempts, lastError: reason });
  else ctx.db.outboundAttempt.insert({ communicationId, attempts, lastError: reason });
  if (attempts < MAX_SEND_ATTEMPTS) return;
  ctx.db.communication.id.update({ ...request, status: "FAILED", result: `Email could not be sent after ${attempts} attempts: ${reason}` });
  const row = ctx.db.billCase.id.find(request.caseId);
  if (!row) return;
  ctx.db.auditEntry.insert({ id: 0n, caseId: row.id, owner: row.owner, at: ctx.timestamp, action: "SEND_EMAIL", tool: "Resend", inputSummary: request.kind, outputSummary: `Dead-lettered after ${attempts} attempts`, status: "FAILED" });
  ctx.db.timelineEvent.insert({ id: 0n, caseId: row.id, owner: row.owner, at: ctx.timestamp, title: "Email could not be sent", detail: "Delivery failed repeatedly; nothing was sent to billing", source: "Email", status: "attention" });
});

/** Ingests a correlated provider statement once, after the authorized email was sent. */
export const ingest_provider_bill_email = spacetimedb.reducer({ caseId: t.u64(), messageId: t.string(), rawStatement: t.string() }, (ctx, { caseId, messageId, rawStatement }) => {
  requireModuleOwner(ctx);
  if (!unseenMessage(ctx, messageId)) return;
  const row = ctx.db.billCase.id.find(caseId);
  if (!row || row.status !== "WAITING_FOR_BILL" || !communicationFor(ctx, caseId, "EMAIL_ITEMIZED_BILL_REQUEST", "SENT")) throw new SenderError("No sent bill request for this case");
  if (rawStatement.length > 128_000) throw new SenderError("Statement is too large");
  const bill = parseItemizedBill(rawStatement);
  if (bill.provider.trim().toLowerCase() !== row.merchant.trim().toLowerCase()) throw new SenderError("Statement provider does not match the case");
  ctx.db.processedEmail.insert({ messageId, caseId, kind: "BILL" });
  storeBill(ctx, row, bill);
});

/** Records a correlated provider response without treating its text as proof of savings. */
export const ingest_provider_review_email = spacetimedb.reducer({ caseId: t.u64(), messageId: t.string(), body: t.string() }, (ctx, { caseId, messageId, body }) => {
  requireModuleOwner(ctx);
  if (!unseenMessage(ctx, messageId)) return;
  const row = ctx.db.billCase.id.find(caseId);
  if (!row || row.status !== "WAITING_FOR_PROVIDER") throw new SenderError("Case is not waiting for a provider reply");
  const request = communicationFor(ctx, caseId, "EMAIL_BILLING_REVIEW", "SENT");
  if (!request) throw new SenderError("No sent provider review request");
  if (body.length > 128_000) throw new SenderError("Provider reply is too large");
  ctx.db.processedEmail.insert({ messageId, caseId, kind: "REVIEW" });
  ctx.db.communication.id.update({ ...request, status: "COMPLETED", result: "Provider reply received; adjustment requires verification" });
  ctx.db.communication.insert({ id: 0n, caseId, owner: row.owner, kind: "EMAIL_PROVIDER_REPLY", at: ctx.timestamp, status: "COMPLETED", transcript: "Provider reply received. Review the original email before relying on its claims.", result: "Awaiting verification", messageId });
  logStep(ctx, row, { action: "RECEIVE_REVIEW_REPLY", tool: "Cloudflare Email Routing", input: "Correlated provider reply", output: "Verification pending", title: "Provider reply received", detail: "Any correction still needs supporting evidence", source: "Provider email" });
});

/** Deletes only the caller's synthetic demo case and its pending delivery. */
export const reset_demo = spacetimedb.reducer((ctx) => {
  for (const row of [...ctx.db.billCase.owner.filter(ctx.sender)].filter((item) => item.transactionId === DEMO_TRANSACTION.id)) {
    for (const delivery of [...ctx.db.billDelivery.caseId.filter(row.id)]) ctx.db.billDelivery.scheduledId.delete(delivery.scheduledId);
    for (const item of [...ctx.db.medicalRecord.caseId.filter(row.id)]) ctx.db.medicalRecord.id.delete(item.id);
    for (const item of [...ctx.db.billItem.caseId.filter(row.id)]) ctx.db.billItem.id.delete(item.id);
    for (const item of [...ctx.db.finding.caseId.filter(row.id)]) ctx.db.finding.id.delete(item.id);
    for (const item of [...ctx.db.timelineEvent.caseId.filter(row.id)]) ctx.db.timelineEvent.id.delete(item.id);
    for (const item of [...ctx.db.auditEntry.caseId.filter(row.id)]) ctx.db.auditEntry.id.delete(item.id);
    for (const item of [...ctx.db.communication.caseId.filter(row.id)]) { ctx.db.outboundAttempt.communicationId.delete(item.id); ctx.db.communication.id.delete(item.id); }
    for (const item of [...ctx.db.priceComparison.caseId.filter(row.id)]) ctx.db.priceComparison.id.delete(item.id);
    ctx.db.insuranceSummary.caseId.delete(row.id);
    for (const item of [...ctx.db.processedEmail.caseId.filter(row.id)]) ctx.db.processedEmail.messageId.delete(item.messageId);
    ctx.db.billCase.id.delete(row.id);
  }
});

// Public, per-caller views are the only way clients read data; every table above is private.
export const my_cases = spacetimedb.view({ name: "my_cases", public: true }, t.array(billCase.rowType), (ctx) => [...ctx.db.billCase.owner.filter(ctx.sender)]);
export const my_medical_records = spacetimedb.view({ name: "my_medical_records", public: true }, t.array(medicalRecord.rowType), (ctx) => [...ctx.db.medicalRecord.owner.filter(ctx.sender)]);
export const my_bill_items = spacetimedb.view({ name: "my_bill_items", public: true }, t.array(billItem.rowType), (ctx) => [...ctx.db.billItem.owner.filter(ctx.sender)]);
export const my_findings = spacetimedb.view({ name: "my_findings", public: true }, t.array(finding.rowType), (ctx) => [...ctx.db.finding.owner.filter(ctx.sender)]);
export const my_timeline = spacetimedb.view({ name: "my_timeline", public: true }, t.array(timelineEvent.rowType), (ctx) => [...ctx.db.timelineEvent.owner.filter(ctx.sender)]);
export const my_audit_log = spacetimedb.view({ name: "my_audit_log", public: true }, t.array(auditEntry.rowType), (ctx) => [...ctx.db.auditEntry.owner.filter(ctx.sender)]);
export const my_communications = spacetimedb.view({ name: "my_communications", public: true }, t.array(communication.rowType), (ctx) => [...ctx.db.communication.owner.filter(ctx.sender)]);
export const my_insurance = spacetimedb.view({ name: "my_insurance", public: true }, t.array(insuranceSummary.rowType), (ctx) => [...ctx.db.insuranceSummary.owner.filter(ctx.sender)]);
export const my_price_comparisons = spacetimedb.view({ name: "my_price_comparisons", public: true }, t.array(priceComparison.rowType), (ctx) => [...ctx.db.priceComparison.owner.filter(ctx.sender)]);
