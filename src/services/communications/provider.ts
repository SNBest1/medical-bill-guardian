import type { Communication, Finding, Resolution } from "../../types/domain";

export interface ItemizedBillRequestContext {
  caseId: string;
  providerName: string;
}

export interface CommunicationProvider {
  requestItemizedBill(context: ItemizedBillRequestContext): Promise<Communication>;
  getItemizedBill(providerName: string, request: Communication): Promise<string | null>;
  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[]): Promise<{ resolution: Resolution; communication: Communication }>;
  notifyUser(summary: string): Promise<Communication>;
}
