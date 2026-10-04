import type { Communication, Finding, InsuranceContext, Resolution } from "../../types/domain";
import type { CommunicationProvider } from "./provider";
import { billRequestTurns, billingReviewTurns } from "./demo-call";
import { parseItemizedBill } from "./parse-bill";
import { scenarioForProvider } from "../scenarios";

const communication = (type: Communication["type"], transcript: string, result: string): Communication => ({ id: crypto.randomUUID(), type, timestamp: new Date().toISOString(), status: "COMPLETED", transcript, result });
const script = (turns: { speaker: string; text: string }[]) => turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n");
const fixtureFor = (providerName: string) => {
  const scenario = scenarioForProvider(providerName);
  if (!scenario) throw new Error(`The demo fixture has no scenario for ${providerName}`);
  return scenario;
};

export class MockCommunicationProvider implements CommunicationProvider {
  constructor(private readonly billDelayMs = 750) {}

  /** Records a pending request without contacting a hospital. */
  async requestItemizedBill(providerName: string) {
    return { ...communication("ITEMIZED_BILL_REQUEST", script(billRequestTurns(fixtureFor(providerName))), "Awaiting itemized statement"), status: "PENDING" as const };
  }

  /** Delivers the scenario's plain-text statement after the mock provider's short delay. */
  async getItemizedBill(providerName: string, request: Communication) {
    const scenario = fixtureFor(providerName);
    if (request.type !== "ITEMIZED_BILL_REQUEST") throw new Error("The demo fixture supports only itemized bill requests");
    return Date.now() - Date.parse(request.timestamp) >= this.billDelayMs ? scenario.statement : null;
  }

  /** Supplies the scenario's seeded provider answer after explicit authorization. */
  async requestBillingReview(providerName: string, invoiceId: string, findings: Finding[], insurance?: InsuranceContext) {
    const scenario = fixtureFor(providerName);
    const bill = parseItemizedBill(scenario.statement);
    if (invoiceId !== bill.invoiceId) throw new Error("The demo fixture supports only the seeded invoice for this hospital");
    const { flagged, result, explanation } = scenario.outcome;
    const target = flagged ? findings.find((finding) => finding.action === "REQUEST_REVIEW" && finding.description === flagged) : undefined;
    if (!flagged || !result || !target) throw new Error("The demo correction requires the scenario's seeded flagged finding");
    const adjustment = result === "DUPLICATE_REMOVED" ? target.amount : 0;
    const resolution: Resolution = { result, originalTotal: bill.total, correctedTotal: bill.total - adjustment, adjustment, explanation };
    const insured = insurance?.coverage === "INSURED";
    const money = `$${adjustment.toLocaleString()}`;
    const text = adjustment === 0
      ? `${explanation} Written demo confirmation recorded. No refund is owed; no real money moved.`
      : insured ? `${explanation} Written demo correction recorded. Insurance reprocessing is required; the patient refund is unknown.` : `${explanation} Written demo refund confirmation: DEMO-${invoiceId}-REFUND. ${money} refund pending; no real money moved.`;
    return { resolution, communication: communication("BILLING_REVIEW", script(billingReviewTurns(scenario, insured)), text) };
  }

  /** Records a demo notification without sending a real message. */
  async notifyUser(summary: string) { return communication("USER_NOTIFICATION", "Demo in-app notification", summary); }
}
