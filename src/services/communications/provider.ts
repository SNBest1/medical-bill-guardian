import type { Communication, Finding, InsuranceContext, ItemizedBill, Resolution } from "../../types/domain";

export interface ItemizedBillRequestContext {
  caseId: string;
  /** Stable per demo run (first audit entry id); scopes Fish idempotency so a reset allows a fresh call. */
  attemptId: string;
  providerName: string;
  /** The case's scenario. Needed because several demo patients share one hospital name. */
  scenarioId?: string;
}

/** What a live billing-review call needs beyond the invoice: the case it belongs to (for idempotency), the bill, and the patient. */
export interface BillingReviewContext {
  caseId: string;
  attemptId: string;
  scenarioId?: string;
  bill: ItemizedBill;
}

/** A review call still in progress, or finished with the resolution the transcript supports. */
export type ReviewSettlement =
  | { done: false; transcript: string }
  | { done: true; transcript: string; resolution: Resolution };

export interface CommunicationProvider {
  /** True when requesting the bill places a real call, so the orchestrator must pause for user authorization first. */
  readonly requiresCallAuthorization?: boolean;
  requestItemizedBill(context: ItemizedBillRequestContext): Promise<Communication>;
  getItemizedBill(providerName: string, request: Communication, scenarioId?: string): Promise<string | null>;
  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[], insurance?: InsuranceContext, context?: BillingReviewContext): Promise<{ resolution: Resolution; communication: Communication }>;
  /** Present only when the review is a real call: reads the call's transcript and, once it has ended, decides the outcome. */
  settleBillingReview?(request: Communication, bill: ItemizedBill, findings: Finding[]): Promise<ReviewSettlement>;
  notifyUser(summary: string): Promise<Communication>;
}
