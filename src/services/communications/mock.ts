import { demoBill, demoStatement } from "../demo";
import type { Communication, Finding, Resolution } from "../../types/domain";
import type { CommunicationProvider } from "./provider";

const communication = (type: Communication["type"], transcript: string, result: string): Communication => ({ id: crypto.randomUUID(), type, timestamp: new Date().toISOString(), status: "COMPLETED", transcript, result });

export class MockCommunicationProvider implements CommunicationProvider {
  constructor(private readonly billDelayMs = 750) {}

  /** Records a pending request without contacting a hospital. */
  async requestItemizedBill(providerName: string) {
    if (providerName !== "University Hospital") throw new Error("The demo fixture supports only University Hospital");
    return { ...communication("ITEMIZED_BILL_REQUEST", `Demo request to ${providerName} billing for an itemized statement, service dates, codes, charges, adjustments, and patient responsibility.`, "Awaiting itemized statement"), status: "PENDING" as const };
  }

  /** Delivers a plain-text statement after the mock provider's short delay. */
  async getItemizedBill(providerName: string, request: Communication) {
    if (providerName !== "University Hospital" || request.type !== "ITEMIZED_BILL_REQUEST") throw new Error("The demo fixture supports only University Hospital bill requests");
    return Date.now() - Date.parse(request.timestamp) >= this.billDelayMs ? demoStatement : null;
  }

  /** Supplies the seeded provider confirmation after explicit authorization. */
  async requestBillingReview(providerName: string, invoiceId: string, findings: Finding[]) {
    if (providerName !== "University Hospital" || invoiceId !== demoBill.invoiceId) throw new Error("The demo fixture supports only the seeded University Hospital invoice");
    const target = findings.find((finding) => finding.action === "REQUEST_REVIEW");
    const resolution: Resolution = { result: "DUPLICATE_REMOVED", originalTotal: 4820, correctedTotal: 4120, adjustment: 700, explanation: "The hospital confirmed that the $700 specialist consultation duplicated services already included in the emergency room charge and removed it." };
    return { resolution, communication: communication("BILLING_REVIEW", `Demo request to ${providerName} billing about invoice ${invoiceId}: verify the ${target?.description ?? "questioned"} charge and provide documentation or a correction.`, resolution.explanation) };
  }

  /** Records a demo notification without sending a real message. */
  async notifyUser(summary: string) { return communication("USER_NOTIFICATION", "Demo in-app notification", summary); }
}
