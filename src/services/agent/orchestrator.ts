import type { MedicalBillCase, Transaction } from "../../types/domain";
import type { MedicalRecordProvider } from "../medical/provider";
import type { CommunicationProvider } from "../communications/provider";
import { reconcile } from "../reconciliation/reconcile";
import { matchEncounter } from "../reconciliation/matcher";
import { generateCaseSummary } from "./summary";
import { parseItemizedBill } from "../communications/parse-bill";

function record(caseData: MedicalBillCase, action: string, tool: string, inputSummary: string, outputSummary: string, title: string, detail: string, source: string) {
  const timestamp = new Date().toISOString();
  caseData.auditLog.push({ id: crypto.randomUUID(), timestamp, action, tool, inputSummary, outputSummary, status: "SUCCESS" });
  caseData.timeline.push({ id: crypto.randomUUID(), timestamp, title, detail, source, status: "complete" });
  caseData.updatedAt = timestamp;
}

/** Creates a case from a qualifying bank transaction. */
export function createCase(transaction: Transaction): MedicalBillCase {
  const now = new Date().toISOString();
  return { id: transaction.id === "nessie-demo-4820" ? "CASE-4821" : `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, status: "DETECTED", transaction, provider: { name: transaction.merchant }, medicalRecords: [], bill: null, findings: [], communications: [], timeline: [{ id: crypto.randomUUID(), timestamp: now, title: "Hospital payment detected", detail: `$${transaction.amount.toLocaleString()} payment to ${transaction.merchant}`, source: "Bank transaction", status: "complete" }], auditLog: [{ id: crypto.randomUUID(), timestamp: now, action: "CREATE_CASE", tool: "getTransaction", inputSummary: transaction.id, outputSummary: "Case opened", status: "SUCCESS" }], resolution: null, summary: null, createdAt: now, updatedAt: now };
}

/** Retrieves records and pauses before any provider contact is made. */
export async function investigateCase(current: MedicalBillCase, medical: MedicalRecordProvider): Promise<MedicalBillCase> {
  if (current.status !== "DETECTED") return current;
  const next = structuredClone(current);
  next.status = "FETCHING_RECORDS";
  next.medicalRecords = await medical.getMedicalRecords(next.transaction);
  record(next, "FETCH_RECORDS", "getMedicalRecords", next.transaction.date, `${next.medicalRecords.length} records`, "Medical records retrieved", `${next.medicalRecords.length} relevant records found near the payment date`, "Medical record");
  const encounter = matchEncounter(next.transaction, next.medicalRecords);
  if (encounter) record(next, "MATCH_ENCOUNTER", "matchEncounter", next.transaction.merchant, encounter.id, "Medical encounter located", `${encounter.description} · ${encounter.date}`, "Medical record");
  next.status = "REQUESTING_BILL";
  return next;
}

/** Requests the itemized statement only after explicit user authorization. */
export async function requestItemizedBill(current: MedicalBillCase, communications: CommunicationProvider, authorized: boolean): Promise<MedicalBillCase> {
  if (!authorized) throw new Error("User authorization is required before requesting an itemized bill");
  if (current.status !== "REQUESTING_BILL") throw new Error("Case is not ready to request an itemized bill");
  if (current.communications.some((item) => item.type === "ITEMIZED_BILL_REQUEST")) throw new Error("An itemized bill request already exists");
  const next = structuredClone(current);
  const request = await communications.requestItemizedBill({ caseId: next.id, attemptId: next.auditLog[0].id, providerName: next.provider.name });
  next.communications.push(request);
  record(next, "REQUEST_BILL", "requestItemizedBill", next.provider.name, "Call queued", "Hospital call queued", "The authorized request for an itemized bill was queued; the statement has not been received yet", "Hospital billing");
  next.status = "WAITING_FOR_BILL";
  return next;
}

/** Parses a delivered statement and compares every charge with clinical evidence. */
export async function analyzeCase(current: MedicalBillCase, communications: CommunicationProvider): Promise<MedicalBillCase> {
  if (current.status !== "WAITING_FOR_BILL") return current;
  const request = current.communications.find((item) => item.type === "ITEMIZED_BILL_REQUEST");
  if (!request) throw new Error("Itemized bill request is missing");
  const statement = await communications.getItemizedBill(current.provider.name, request);
  if (!statement) {
    const next = structuredClone(current);
    next.auditLog.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: "CHECK_BILL", tool: "getItemizedBill", inputSummary: request.id, outputSummary: "Statement not yet available", status: "SUCCESS" });
    next.updatedAt = new Date().toISOString();
    return next;
  }
  const next = structuredClone(current);
  next.bill = parseItemizedBill(statement);
  const savedRequest = next.communications.find((item) => item.id === request.id)!;
  savedRequest.status = "COMPLETED";
  savedRequest.result = `Invoice ${next.bill.invoiceId} received`;
  record(next, "RECEIVE_BILL", "getItemizedBill", request.id, next.bill.invoiceId, "Itemized bill received", `Statement for invoice ${next.bill.invoiceId}`, "Hospital billing");
  record(next, "PARSE_BILL", "parseItemizedBill", next.bill.invoiceId, `${next.bill.items.length} charges`, "Itemized bill parsed", `${next.bill.items.length} charges extracted from the provider statement`, "Case agent");
  next.status = "ANALYZING";
  next.findings = reconcile(next.bill, next.medicalRecords);
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
  const response = await communications.requestBillingReview(next.provider.name, current.bill.invoiceId, next.findings);
  next.communications.push(response.communication);
  next.resolution = response.resolution;
  record(next, "REQUEST_REVIEW", "requestBillingReview", `${next.findings.filter((finding) => finding.action === "REQUEST_REVIEW").length} findings`, response.resolution.result, "Hospital billing responded", response.resolution.explanation, "Hospital billing");
  next.status = response.resolution.result === "PROVIDER_REVIEW_PENDING" ? "WAITING_FOR_PROVIDER" : "RESOLVED";
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
  next.summary = await generateCaseSummary(next, fallback, process.env.DEMO_MODE !== "false" ? process.env.OPENAI_API_KEY : undefined);
  record(next, "GENERATE_SUMMARY", "generateCaseSummary", "Structured case facts", next.summary === fallback ? "Deterministic summary" : "AI-assisted summary", "Plain-language summary prepared", "Case outcome explained from verified facts", "Case agent");
  const notification = await communications.notifyUser(next.summary);
  next.communications.push(notification);
  record(next, "NOTIFY_USER", "notifyUser", next.id, "In-app summary recorded", "You were notified", "Review summary added to your case", "Notification");
  next.status = "USER_NOTIFIED";
  return next;
}
