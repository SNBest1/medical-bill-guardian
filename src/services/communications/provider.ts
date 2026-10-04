import type { Communication, Finding, InsuranceContext, Resolution } from "../../types/domain";

export interface ItemizedBillRequestContext {
  caseId: string;
  /** Stable per demo run (first audit entry id); scopes Fish idempotency so a reset allows a fresh call. */
  attemptId: string;
  providerName: string;
}

export interface CommunicationProvider {
  /** True when requesting the bill places a real call, so the orchestrator must pause for user authorization first. */
  readonly requiresCallAuthorization?: boolean;
  requestItemizedBill(context: ItemizedBillRequestContext): Promise<Communication>;
  getItemizedBill(providerName: string, request: Communication): Promise<string | null>;
  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[], insurance?: InsuranceContext): Promise<{ resolution: Resolution; communication: Communication }>;
  notifyUser(summary: string): Promise<Communication>;
}
