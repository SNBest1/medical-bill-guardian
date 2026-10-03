import type { Communication, Finding, ItemizedBill, Resolution } from "../../types/domain";

export interface CommunicationProvider {
  requestItemizedBill(providerName: string): Promise<{ bill: ItemizedBill; communication: Communication }>;
  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[]): Promise<{ resolution: Resolution; communication: Communication }>;
  notifyUser(summary: string): Promise<Communication>;
}
