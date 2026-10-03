import { demoBill, demoStatement } from "../demo";
import type { Communication, Finding, InsuranceContext, Resolution } from "../../types/domain";
import type { CommunicationProvider } from "./provider";
import { billRequestCall, billingReviewCall, insuredBillingReviewCall } from "./demo-call";

const communication = (type: Communication["type"], transcript: string, result: string): Communication => ({ id: crypto.randomUUID(), type, timestamp: new Date().toISOString(), status: "COMPLETED", transcript, result });

export class MockCommunicationProvider implements CommunicationProvider {
  constructor(private readonly billDelayMs = 750) {}

  /** Records a pending request without contacting a hospital. */
  async requestItemizedBill(providerName: string) {
    if (providerName !== "University Hospital") throw new Error("The demo fixture supports only University Hospital");
    return { ...communication("ITEMIZED_BILL_REQUEST", billRequestCall.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"), "Awaiting itemized statement"), status: "PENDING" as const };
  }

  /** Delivers a plain-text statement after the mock provider's short delay. */
  async getItemizedBill(providerName: string, request: Communication) {
    if (providerName !== "University Hospital" || request.type !== "ITEMIZED_BILL_REQUEST") throw new Error("The demo fixture supports only University Hospital bill requests");
    return Date.now() - Date.parse(request.timestamp) >= this.billDelayMs ? demoStatement : null;
  }

  /** Supplies the seeded provider confirmation after explicit authorization. */
  async requestBillingReview(providerName: string, invoiceId: string, findings: Finding[], insurance?: InsuranceContext) {
    if (providerName !== "University Hospital" || invoiceId !== demoBill.invoiceId) throw new Error("The demo fixture supports only the seeded University Hospital invoice");
    const target = findings.find((finding) => finding.action === "REQUEST_REVIEW" && finding.description === "Specialist consultation" && finding.amount === 700);
    if (!target) throw new Error("The demo correction requires the seeded specialist finding");
    const resolution: Resolution = { result: "DUPLICATE_REMOVED", originalTotal: 4820, correctedTotal: 4120, adjustment: 700, explanation: "The hospital confirmed that the $700 specialist consultation duplicated services already included in the emergency room charge and removed it." };
    const insured = insurance?.coverage === "INSURED";
    return { resolution, communication: communication("BILLING_REVIEW", (insured ? insuredBillingReviewCall : billingReviewCall).map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"), insured ? `${resolution.explanation} Written demo correction recorded. Insurance reprocessing is required; the patient refund is unknown.` : `${resolution.explanation} Written demo refund confirmation: DEMO-${invoiceId}-REFUND. $700 refund pending; no real money moved.`) };
  }

  /** Records a demo notification without sending a real message. */
  async notifyUser(summary: string) { return communication("USER_NOTIFICATION", "Demo in-app notification", summary); }
}
