import type { MedicalBillCase, Transaction } from "../../types/domain";
import type { MedicalRecordProvider } from "../medical/provider";
import type { CommunicationProvider } from "../communications/provider";
import { reconcile } from "../reconciliation/reconcile";
import { matchEncounter } from "../reconciliation/matcher";
import { generateCaseSummary } from "./summary";

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

/** Retrieves records and a bill, then reconciles charges and pauses for review. */
export async function investigateCase(current: MedicalBillCase, medical: MedicalRecordProvider, communications: CommunicationProvider): Promise<MedicalBillCase> {
  if (current.status !== "DETECTED") return current;
  const next = structuredClone(current);
  next.status = "FETCHING_RECORDS";
  next.medicalRecords = await medical.getMedicalRecords(next.transaction);
  record(next, "FETCH_RECORDS", "getMedicalRecords", next.transaction.date, `${next.medicalRecords.length} records`, "Medical records retrieved", `${next.medicalRecords.length} relevant records found near the payment date`, "Medical record");
  const encounter = matchEncounter(next.transaction, next.medicalRecords);
  if (encounter) record(next, "MATCH_ENCOUNTER", "matchEncounter", next.transaction.merchant, encounter.id, "Medical encounter located", `${encounter.description} · ${encounter.date}`, "Medical record");
  next.status = "REQUESTING_BILL";
  const billResult = await communications.requestItemizedBill(next.provider.name);
  next.bill = billResult.bill;
  next.communications.push(billResult.communication);
  record(next, "REQUEST_BILL", "requestItemizedBill", next.provider.name, billResult.bill.invoiceId, "Itemized bill received", `${billResult.bill.items.length} charges · Invoice ${billResult.bill.invoiceId}`, "Hospital billing");
  next.status = "ANALYZING";
  next.findings = reconcile(billResult.bill, next.medicalRecords);
  const supported = next.findings.filter((finding) => finding.clinicalStatus === "SUPPORTED").length;
  const review = next.findings.filter((finding) => finding.action === "REQUEST_REVIEW").length;
  record(next, "RECONCILE", "compareBillToRecords", `${billResult.bill.items.length} charges`, `${supported} supported, ${review} need review`, "Bill analyzed", `${supported} supported · ${review} requires review`, "Reconciliation engine");
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
