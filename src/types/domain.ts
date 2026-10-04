export type CaseStatus = "DETECTED" | "FETCHING_RECORDS" | "REQUESTING_BILL" | "WAITING_FOR_BILL" | "ANALYZING" | "REVIEW_REQUIRED" | "CONTACTING_PROVIDER" | "WAITING_FOR_PROVIDER" | "RESOLVED" | "USER_NOTIFIED" | "FAILED";
export type ClinicalStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NO_MATCH_FOUND" | "DUPLICATE_SUSPECTED" | "DATE_MISMATCH" | "AMOUNT_REVIEW" | "INSUFFICIENT_DATA";

export interface Transaction { id: string; merchant: string; amount: number; date: string; category?: string }
export interface MedicalRecord { id: string; type: "encounter" | "imaging" | "procedure" | "medication" | "lab" | "document" | "vital"; description: string; date: string; provider: string; /** FinchNode category the record came from (for example "labs" or "diagnosticReports"); absent on hand-written fixtures. */ category?: string }
export interface BillItem { id: string; description: string; code?: string; amount: number; serviceDate: string; units?: number; setting?: "INPATIENT" | "OUTPATIENT"; component?: "FACILITY" | "PROFESSIONAL" | "GLOBAL"; modifiers?: string[] }
export interface ItemizedBill { invoiceId: string; provider: string; patient?: string; total: number; patientResponsibility?: number; insuranceAdjustments?: number; items: BillItem[] }
export interface ExplanationOfBenefits { invoiceId: string; serviceDate: string; billedTotal: number; allowedTotal: number; contractualAdjustment: number; insurerPaid: number; otherPayerPaid: number; deductible: number; copay: number; coinsurance: number; noncovered: number; patientResponsibility: number }
export interface InsuranceContext { coverage: "SELF_PAY" | "INSURED" | "UNKNOWN"; network: "IN_NETWORK" | "OUT_OF_NETWORK" | "UNKNOWN"; claimStatus: "FINAL" | "PENDING" | "DENIED" | "UNKNOWN"; payer?: string; plan?: string; eob?: ExplanationOfBenefits }
export interface FinancialReview { status: "NEEDS_INFORMATION" | "CLAIM_PENDING" | "REVIEW_REQUIRED" | "RECONCILED" | "REPROCESSING_REQUIRED"; expectedPatientResponsibility?: number; possibleExcessPayment?: number; reasons: string[] }
export interface PriceComparison { referenceAmount: number; multiple: number; sourceName: string; sourceUrl: string; basis: "CASH" | "NEGOTIATED" | "MEDICARE"; asOf: string }
export interface Finding { billItemId: string; description: string; amount: number; clinicalStatus: ClinicalStatus; pricingStatus: "NOT_ASSESSED" | "ASSESSED" | "REVIEW"; priceComparison?: PriceComparison; confidence: number; evidence: string[]; evidenceRecordIds?: string[]; explanation: string; action: "NONE" | "REQUEST_REVIEW" }
export interface TimelineEvent { id: string; timestamp: string; title: string; detail: string; source: string; status: "complete" | "attention" | "pending" }
export interface AuditEntry { id: string; timestamp: string; action: string; tool: string; inputSummary: string; outputSummary: string; status: "SUCCESS" | "FAILED" }
export interface Communication { id: string; type: "ITEMIZED_BILL_REQUEST" | "BILLING_REVIEW" | "USER_NOTIFICATION"; timestamp: string; status: "COMPLETED" | "PENDING"; transcript: string; result?: string; /** Fish session of a live call; present while the call is in flight so the app can fetch its transcript. */ sessionId?: string; /** True when the transcript is the real call, not a rehearsed script. */ live?: boolean }
export interface Resolution { result: "DUPLICATE_REMOVED" | "CHARGE_VERIFIED" | "PROVIDER_REVIEW_PENDING" | "UNRESOLVED"; originalTotal: number; correctedTotal: number; adjustment: number; explanation: string }
export interface Recovery { status: "REFUND_PENDING" | "REFUND_RECEIVED"; amount: number; confirmation: string; creditTransactionId?: string; bankSource?: "nessie"; balanceBefore?: number; balanceAfter?: number; calculatedBalanceAfter?: number; simulated: boolean }
/** One real operation the agent performed while reading a delivered bill; `status` colors the step in the live panel. */
export interface ReadingStep { id: string; at: string; kind: "received" | "verified" | "download" | "extract" | "invoice" | "provider" | "patient" | "date" | "charge" | "total" | "done" | "error"; text: string; detail?: string; status?: "ok" | "review" | "fail"; /** Present on per-charge steps so the page can draw the charge row. */ item?: { description: string; amount: number } }
/** Live log of the agent reading a hospital-texted PDF bill; written incrementally so case polling shows it as it happens. */
export interface BillReading { startedAt: string; steps: ReadingStep[]; done: boolean; failed?: boolean }
/** Where the case's medical records came from; `live` is false for synthetic scenario data. */
export interface RecordSource {
  label: string;
  live: boolean;
  /** FinchNode subject the records were read for (a public synthetic demo patient). */
  subject?: string;
  /** When the records were read (live pull) or when the saved copy was used. */
  retrievedAt?: string;
  /** Organization named by the records themselves, for example "Northstar Health System". */
  organization?: string;
  /** Records kept for this case's encounter window, by FinchNode category. */
  counts?: Record<string, number>;
  /** Why the saved copy was used instead of a live pull. Present only on a fallback. */
  fallbackReason?: string;
  /** Which source actually supplied the records: the authenticated consented sandbox patient, the keyless open demo API, or the saved copy. */
  tier?: "sandbox" | "open-demo" | "saved-copy";
  /** Date (YYYY-MM-DD) the sandbox patient's consent was recorded. Present only on the sandbox tier. */
  consentedAt?: string;
  /** Short reason the consented sandbox patient was not used. Present only when a lower tier supplied the records. */
  sandboxNote?: string;
}
export interface MedicalBillCase { id: string; scenarioId?: string; status: CaseStatus; transaction: Transaction; provider: { name: string }; medicalRecords: MedicalRecord[]; recordSource?: RecordSource; reading?: BillReading; bill: ItemizedBill | null; findings: Finding[]; insurance?: InsuranceContext; financialReview?: FinancialReview; communications: Communication[]; timeline: TimelineEvent[]; auditLog: AuditEntry[]; resolution: Resolution | null; recovery?: Recovery; summary: string | null; createdAt: string; updatedAt: string }
