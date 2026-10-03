export type CaseStatus = "DETECTED" | "FETCHING_RECORDS" | "REQUESTING_BILL" | "WAITING_FOR_BILL" | "ANALYZING" | "REVIEW_REQUIRED" | "CONTACTING_PROVIDER" | "WAITING_FOR_PROVIDER" | "RESOLVED" | "USER_NOTIFIED" | "FAILED";
export type ClinicalStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NO_MATCH_FOUND" | "DUPLICATE_SUSPECTED" | "DATE_MISMATCH" | "AMOUNT_REVIEW" | "INSUFFICIENT_DATA";

export interface Transaction { id: string; merchant: string; amount: number; date: string; category?: string }
export interface MedicalRecord { id: string; type: "encounter" | "imaging" | "procedure" | "medication" | "lab" | "document"; description: string; date: string; provider: string }
export interface BillItem { id: string; description: string; code?: string; amount: number; serviceDate: string }
export interface ItemizedBill { invoiceId: string; provider: string; total: number; items: BillItem[] }
export interface Finding { billItemId: string; description: string; amount: number; clinicalStatus: ClinicalStatus; pricingStatus: "NOT_ASSESSED" | "REVIEW"; confidence: number; evidence: string[]; explanation: string; action: "NONE" | "REQUEST_REVIEW" }
export interface TimelineEvent { id: string; timestamp: string; title: string; detail: string; source: string; status: "complete" | "attention" | "pending" }
export interface AuditEntry { id: string; timestamp: string; action: string; tool: string; inputSummary: string; outputSummary: string; status: "SUCCESS" | "FAILED" }
export interface Communication { id: string; type: "ITEMIZED_BILL_REQUEST" | "BILLING_REVIEW" | "USER_NOTIFICATION"; timestamp: string; status: "COMPLETED" | "PENDING"; transcript: string; result?: string }
export interface Resolution { result: "DUPLICATE_REMOVED" | "CHARGE_VERIFIED" | "PROVIDER_REVIEW_PENDING" | "UNRESOLVED"; originalTotal: number; correctedTotal: number; adjustment: number; explanation: string }
export interface MedicalBillCase { id: string; status: CaseStatus; transaction: Transaction; provider: { name: string }; medicalRecords: MedicalRecord[]; bill: ItemizedBill | null; findings: Finding[]; communications: Communication[]; timeline: TimelineEvent[]; auditLog: AuditEntry[]; resolution: Resolution | null; summary: string | null; createdAt: string; updatedAt: string }
