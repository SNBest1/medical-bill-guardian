import type { ItemizedBill, MedicalBillCase, MedicalRecord, RecordSource, Transaction } from "../../types/domain";
import type { MedicalRecordProvider } from "../medical/provider";
import type { CommunicationProvider } from "../communications/provider";
import { reconcile } from "../reconciliation/reconcile";
import { matchEncounter } from "../reconciliation/matcher";
import { generateCaseSummary } from "./summary";
import { parseItemizedBill } from "../communications/parse-bill";
import { comparePrices, loadPriceReferences } from "../reconciliation/pricing";
import { assessPatientBalance } from "../reconciliation/insurance";
import { isDemoTransaction, scenarioForTransaction } from "../scenarios";
import { describeRecordSource } from "../medical/record-source";

/** A provider contact attempt failed after being sent; it may or may not have reached the provider, so retrying automatically is unsafe. */
export class ContactAmbiguousError extends Error {}

function record(caseData: MedicalBillCase, action: string, tool: string, inputSummary: string, outputSummary: string, title: string, detail: string, source: string) {
  const timestamp = new Date().toISOString();
  caseData.auditLog.push({ id: crypto.randomUUID(), timestamp, action, tool, inputSummary, outputSummary, status: "SUCCESS" });
  caseData.timeline.push({ id: crypto.randomUUID(), timestamp, title, detail, source, status: "complete" });
  caseData.updatedAt = timestamp;
}

/** The scenario a case belongs to: the recorded selection, else the one whose seeded payment matches the transaction (the FinchNode patients share one hospital name, so the provider alone is ambiguous). */
export const scenarioIdOf = (current: MedicalBillCase): string | undefined => current.scenarioId ?? scenarioForTransaction(current.transaction)?.id;

/** Creates a case from a qualifying bank transaction. */
export function createCase(transaction: Transaction): MedicalBillCase {
  const now = new Date().toISOString();
  return { id: transaction.id === "nessie-demo-4820" ? "CASE-4821" : `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, status: "DETECTED", transaction, provider: { name: transaction.merchant }, medicalRecords: [], bill: null, findings: [], insurance: isDemoTransaction(transaction) ? { coverage: "SELF_PAY", network: "UNKNOWN", claimStatus: "UNKNOWN" } : undefined, communications: [], timeline: [{ id: crypto.randomUUID(), timestamp: now, title: "Hospital payment detected", detail: `$${transaction.amount.toLocaleString()} payment to ${transaction.merchant}`, source: "Bank transaction", status: "complete" }], auditLog: [{ id: crypto.randomUUID(), timestamp: now, action: "CREATE_CASE", tool: "getTransaction", inputSummary: transaction.id, outputSummary: "Case opened", status: "SUCCESS" }], resolution: null, summary: null, createdAt: now, updatedAt: now };
}

/** Retrieves records, requests a bill, and waits for the provider's statement. */
export async function investigateCase(current: MedicalBillCase, medical: MedicalRecordProvider, communications: CommunicationProvider): Promise<MedicalBillCase> {
  if (current.status !== "DETECTED") return current;
  const next = structuredClone(current);
  next.status = "FETCHING_RECORDS";
  // A provider that reports how it obtained the records (live pull or labeled fallback) is recorded exactly; otherwise only its static label is.
  const retrieved: { records: MedicalRecord[]; source?: RecordSource } = medical.retrieve ? await medical.retrieve(next.transaction) : { records: await medical.getMedicalRecords(next.transaction), source: medical.sourceLabel ? { label: medical.sourceLabel, live: false } : undefined };
  next.medicalRecords = retrieved.records;
  if (retrieved.source) next.recordSource = retrieved.source;
  const sourceNote = retrieved.source ? describeRecordSource(retrieved.source, next.medicalRecords.length) : undefined;
  record(next, "FETCH_RECORDS", "getMedicalRecords", retrieved.source?.subject ? `${retrieved.source.subject} · ${next.transaction.date}` : next.transaction.date, sourceNote ?? `${next.medicalRecords.length} records`, "Medical records retrieved", sourceNote ?? `${next.medicalRecords.length} relevant records found near the payment date`, "Medical record");
  const encounter = matchEncounter(next.transaction, next.medicalRecords);
  if (encounter) record(next, "MATCH_ENCOUNTER", "matchEncounter", next.transaction.merchant, encounter.id, "Medical encounter located", `${encounter.description} · ${encounter.date}`, "Medical record");
  next.status = "REQUESTING_BILL";
  // A real outbound call rings a real phone: stop here until the user authorizes it (see requestItemizedBill).
  if (communications.requiresCallAuthorization) {
    record(next, "AWAIT_CALL_AUTHORIZATION", "requestItemizedBill", next.provider.name, "Waiting for the user to authorize the hospital call", "Ready to call hospital billing", "Records are in. Nothing has been sent; the call needs your approval", "Case agent");
    next.timeline[next.timeline.length - 1].status = "attention";
    return next;
  }
  let request;
  try { request = await communications.requestItemizedBill({ caseId: next.id, attemptId: next.auditLog[0].id, providerName: next.provider.name, scenarioId: scenarioIdOf(next) }); }
  catch (error) { throw new ContactAmbiguousError(`Itemized bill request may or may not have reached the provider: ${error}`); }
  next.communications.push(request);
  record(next, "REQUEST_BILL", "requestItemizedBill", next.provider.name, "Bill request submitted", "Itemized bill requested", "Waiting for the provider's statement", "Hospital billing");
  next.status = "WAITING_FOR_BILL";
  return next;
}

/**
 * Places the authorized outbound call and moves to WAITING_FOR_BILL. Requires explicit
 * authorization, the REQUESTING_BILL checkpoint, and no earlier request, so a repeat can never
 * place a second call. Failures leave the case at REQUESTING_BILL (Fish's idempotency key makes a retry safe).
 */
export async function requestItemizedBill(current: MedicalBillCase, communications: CommunicationProvider, authorized: boolean): Promise<MedicalBillCase> {
  if (!authorized) throw new Error("User authorization is required before calling hospital billing");
  if (current.status !== "REQUESTING_BILL") throw new Error("Case is not ready to call hospital billing");
  if (current.communications.some((item) => item.type === "ITEMIZED_BILL_REQUEST")) throw new Error("An itemized bill request already exists for this case");
  const next = structuredClone(current);
  const request = await communications.requestItemizedBill({ caseId: next.id, attemptId: next.auditLog[0].id, providerName: next.provider.name, scenarioId: scenarioIdOf(next) });
  next.communications.push(request);
  const approval = next.timeline.find((event) => event.title === "Ready to call hospital billing");
  if (approval) { approval.status = "complete"; approval.title = "You authorized the hospital call"; approval.detail = "The call to hospital billing was queued"; }
  record(next, "REQUEST_BILL", "requestItemizedBill", next.provider.name, request.result ?? "Hospital call queued", "Hospital call queued", "The authorized call asks billing to text the itemized bill; the statement has not arrived yet", "Hospital billing");
  next.status = "WAITING_FOR_BILL";
  return next;
}

/** Parses a delivered statement and compares every charge with clinical evidence. */
export async function analyzeCase(current: MedicalBillCase, communications: CommunicationProvider): Promise<MedicalBillCase> {
  if (current.status !== "WAITING_FOR_BILL") return current;
  const request = current.communications.find((item) => item.type === "ITEMIZED_BILL_REQUEST");
  if (!request) throw new Error("Itemized bill request is missing");
  const statement = await communications.getItemizedBill(current.provider.name, request, scenarioIdOf(current));
  if (!statement) {
    const next = structuredClone(current);
    next.auditLog.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: "CHECK_BILL", tool: "getItemizedBill", inputSummary: request.id, outputSummary: "Statement not yet available", status: "SUCCESS" });
    next.updatedAt = new Date().toISOString();
    return next;
  }
  return receiveItemizedStatement(current, statement);
}

/** Shared intake for delivered statements, including the demo inbox fallback. */
export function receiveItemizedStatement(current: MedicalBillCase, statement: string): MedicalBillCase {
  if (current.status !== "WAITING_FOR_BILL") throw new Error("Case is not waiting for an itemized statement");
  return receiveParsedBill(current, parseItemizedBill(statement), "statement");
}

/** Common validation and analysis for an already-parsed bill, whether it came from a plain-text statement or a PDF. */
export function receiveParsedBill(current: MedicalBillCase, bill: ItemizedBill, via: "statement" | "pdf" = "statement"): MedicalBillCase {
  if (current.status !== "WAITING_FOR_BILL") throw new Error("Case is not waiting for an itemized statement");
  const request = current.communications.find((item) => item.type === "ITEMIZED_BILL_REQUEST");
  if (!request) throw new Error("Itemized bill request is missing");
  if (bill.provider !== current.provider.name) throw new Error("Statement provider does not match this case");
  const next = structuredClone(current);
  next.bill = bill;
  const savedRequest = next.communications.find((item) => item.id === request.id)!;
  savedRequest.status = "COMPLETED";
  savedRequest.result = `Invoice ${next.bill.invoiceId} received`;
  const pdf = via === "pdf";
  record(next, "RECEIVE_BILL", pdf ? "receiveBillPdf" : "getItemizedBill", request.id, next.bill.invoiceId, "Itemized bill received", pdf ? `PDF for invoice ${next.bill.invoiceId} texted by the hospital` : `Statement for invoice ${next.bill.invoiceId}`, "Hospital billing");
  record(next, "PARSE_BILL", pdf ? "parsePdfBill" : "parseItemizedBill", next.bill.invoiceId, `${next.bill.items.length} charges`, "Itemized bill parsed", `${next.bill.items.length} charges extracted from the provider ${pdf ? "PDF" : "statement"}`, "Case agent");
  next.status = "ANALYZING";
  next.findings = comparePrices(next.bill, reconcile(next.bill, next.medicalRecords), loadPriceReferences(), next.insurance);
  next.financialReview = assessPatientBalance(next.bill, next.transaction.amount, next.insurance);
  const supported = next.findings.filter((finding) => finding.clinicalStatus === "SUPPORTED").length;
  const review = next.findings.filter((finding) => finding.action === "REQUEST_REVIEW").length;
  record(next, "RECONCILE", "compareBillToRecords", `${next.bill.items.length} charges`, `${supported} supported, ${review} need review`, "Bill analyzed", `${supported} supported · ${review} requires review`, "Reconciliation engine");
  next.status = review ? "REVIEW_REQUIRED" : "RESOLVED";
  if (review) next.timeline.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), title: "Your approval is needed", detail: "Review the uncertain charge before contacting hospital billing", source: "You", status: "attention" });
  return next;
}

/** Contacts provider billing only after the user has authorized review. */
export async function reviewCase(current: MedicalBillCase, communications: CommunicationProvider, authorized: boolean): Promise<MedicalBillCase> {
  if (!authorized) throw new Error("User authorization is required before contacting provider billing");
  if (current.status !== "REVIEW_REQUIRED" || !current.bill) throw new Error("Case is not ready for billing review");
  const next = structuredClone(current);
  next.status = "CONTACTING_PROVIDER";
  const approvalEvent = next.timeline.find((event) => event.title === "Your approval is needed");
  if (approvalEvent) { approvalEvent.status = "complete"; approvalEvent.title = "You authorized billing review"; approvalEvent.detail = "Hospital billing may now verify the questioned charge"; }
  const response = await communications.requestBillingReview(next.provider.name, current.bill.invoiceId, next.findings, next.insurance);
  const resolution = response.resolution;
  if (![resolution.originalTotal, resolution.correctedTotal, resolution.adjustment].every((amount) => Number.isFinite(amount) && amount >= 0) || Math.abs(resolution.originalTotal - current.bill.total) > 0.01 || Math.abs(resolution.originalTotal - resolution.correctedTotal - resolution.adjustment) > 0.01) throw new Error("Provider correction does not reconcile with the itemized bill");
  next.communications.push(response.communication);
  next.resolution = response.resolution;
  if (next.insurance?.coverage === "INSURED" && response.resolution.adjustment > 0) {
    next.financialReview = { status: "REPROCESSING_REQUIRED", reasons: ["The provider corrected gross charges. Obtain a revised insurer EOB and provider patient balance before determining the patient's refund; deductible, copay, coinsurance, secondary payments, and benefit accumulators may change."] };
    delete next.recovery;
  } else if (response.resolution.adjustment > 0 && process.env.DEMO_MODE !== "false" && isDemoTransaction(next.transaction)) {
    next.recovery = { status: "REFUND_PENDING", amount: response.resolution.adjustment, confirmation: `DEMO-${current.bill.invoiceId}-REFUND`, simulated: true };
  }
  record(next, "REQUEST_REVIEW", "requestBillingReview", `${next.findings.filter((finding) => finding.action === "REQUEST_REVIEW").length} findings`, response.resolution.result, "Hospital billing responded", response.resolution.explanation, "Hospital billing");
  next.status = response.resolution.result === "PROVIDER_REVIEW_PENDING" ? "WAITING_FOR_PROVIDER" : "RESOLVED";
  return next;
}

/** Applies only the fixed synthetic refund credit; never claims a real bank refund. */
export function receiveDemoRefund(current: MedicalBillCase): MedicalBillCase {
  if (process.env.DEMO_MODE === "false") throw new Error("Synthetic refund credits require demo mode");
  if (!current.recovery?.simulated || !current.resolution || current.status !== "USER_NOTIFIED") throw new Error("No completed synthetic review is awaiting a refund");
  if (current.recovery.status === "REFUND_RECEIVED") return current;
  if (!isDemoTransaction(current.transaction) || current.recovery.amount !== current.resolution.adjustment) throw new Error("Refund does not match the seeded payment correction");
  const next = structuredClone(current);
  next.recovery!.status = "REFUND_RECEIVED";
  next.recovery!.creditTransactionId = `demo-credit-${next.recovery!.amount}`;
  record(next, "VERIFY_DEMO_CREDIT", "matchSyntheticCredit", next.transaction.id, `Synthetic $${next.recovery!.amount.toLocaleString()} credit matched`, "Demo refund received", `A synthetic $${next.recovery!.amount.toLocaleString()} credit matched the approved correction. No real money moved.`, "Synthetic bank credit");
  next.summary = `${next.summary ?? ""} A synthetic $${next.recovery!.amount.toLocaleString()} refund credit has now been matched in the demo; no real money moved.`;
  return next;
}

/** Generates a plain-language result and records the notification. */
export async function notifyCase(current: MedicalBillCase, communications: CommunicationProvider): Promise<MedicalBillCase> {
  if (current.status !== "RESOLVED") throw new Error("Case is not resolved");
  const next = structuredClone(current);
  const result = next.resolution;
  const supported = next.findings.filter((finding) => finding.clinicalStatus === "SUPPORTED").length;
  const questioned = next.findings.filter((finding) => finding.action === "REQUEST_REVIEW");
  const reviewText = questioned.length ? `We could not verify ${questioned.map((finding) => `${finding.description} (${`$${finding.amount.toLocaleString()}`})`).join(", ")} from those records, so we asked hospital billing to review ${questioned.length === 1 ? "it" : "them"}.` : "";
  const outcomeText = result ? `${result.explanation} The bill changed from $${result.originalTotal.toLocaleString()} to $${result.correctedTotal.toLocaleString()}${result.adjustment > 0 ? `, a $${result.adjustment.toLocaleString()} correction` : ""}.` : "";
  const fallback = `We reviewed your ${next.provider.name} bill and compared its charges with your available medical records. ${supported} ${supported === 1 ? "service had" : "services had"} supporting records. ${reviewText} ${outcomeText}`.trim();
  const generated = await generateCaseSummary(next, fallback, process.env.DEMO_MODE !== "false" ? process.env.OPENAI_API_KEY : undefined);
  next.summary = next.financialReview?.status === "REPROCESSING_REQUIRED" ? `${fallback} This corrects gross charges. The patient's refund is not yet known; insurance must reprocess the claim and issue a revised EOB.` : next.recovery ? `${generated} Because the bill was already paid, the ${`$${next.recovery.amount.toLocaleString()}`} demo refund is pending; money has not been received.` : generated;
  record(next, "GENERATE_SUMMARY", "generateCaseSummary", "Structured case facts", generated === fallback ? "Deterministic summary" : "AI-assisted summary", "Plain-language summary prepared", "Case outcome explained from verified facts", "Case agent");
  const notification = await communications.notifyUser(next.summary);
  next.communications.push(notification);
  record(next, "NOTIFY_USER", "notifyUser", next.id, "In-app summary recorded", "You were notified", "Review summary added to your case", "Notification");
  next.status = "USER_NOTIFIED";
  return next;
}
