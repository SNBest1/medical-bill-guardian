export type CaseStatus = "DETECTED" | "FETCHING_RECORDS" | "REQUESTING_BILL" | "WAITING_FOR_BILL" | "ANALYZING" | "REVIEW_REQUIRED" | "CONTACTING_PROVIDER" | "WAITING_FOR_PROVIDER" | "RESOLVED" | "USER_NOTIFIED" | "FAILED";
export type ClinicalStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NO_MATCH_FOUND" | "DUPLICATE_SUSPECTED" | "DATE_MISMATCH" | "AMOUNT_REVIEW" | "INSUFFICIENT_DATA";
export type RecordKind = "encounter" | "imaging" | "procedure" | "medication" | "lab" | "document";

export interface RecordInput { kind: RecordKind; description: string; date: string; provider: string }
export interface BillLine { description: string; code?: string; amountCents: number; serviceDate: string }
export interface ParsedBill { invoiceId: string; provider: string; totalCents: number; items: BillLine[] }
export interface FindingInput {
  /** Index into ParsedBill.items, or null for whole-bill findings such as a total mismatch. */
  lineIndex: number | null;
  description: string; amountCents: number; clinicalStatus: ClinicalStatus;
  pricingStatus: "NOT_ASSESSED" | "REVIEW"; confidence: number; evidence: string[];
  explanation: string; action: "NONE" | "REQUEST_REVIEW";
}
export interface ResolutionInput { result: "DUPLICATE_REMOVED" | "CHARGE_VERIFIED" | "PROVIDER_REVIEW_PENDING" | "UNRESOLVED"; originalTotalCents: number; correctedTotalCents: number; adjustmentCents: number; explanation: string }
