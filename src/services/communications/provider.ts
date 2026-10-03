import type { Communication, Finding, InsuranceContext, Resolution } from "../../types/domain";

export interface CommunicationProvider {
  requestItemizedBill(providerName: string): Promise<Communication>;
  getItemizedBill(providerName: string, request: Communication): Promise<string | null>;
  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[], insurance?: InsuranceContext): Promise<{ resolution: Resolution; communication: Communication }>;
  notifyUser(summary: string): Promise<Communication>;
}
