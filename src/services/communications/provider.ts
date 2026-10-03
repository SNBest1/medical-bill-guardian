import type { Communication, Finding, Resolution } from "../../types/domain";

export interface CommunicationProvider {
  requestItemizedBill(providerName: string): Promise<Communication>;
  getItemizedBill(providerName: string, request: Communication): Promise<string | null>;
  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[]): Promise<{ resolution: Resolution; communication: Communication }>;
  notifyUser(summary: string): Promise<Communication>;
}
