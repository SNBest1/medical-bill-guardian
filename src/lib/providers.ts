import { MockBankProvider } from "../services/banking/mock";
import { NessieBankProvider } from "../services/banking/nessie";
import { ScenarioFinchNodeProvider } from "../services/medical/scenario-finchnode";
import { FinchNodeProvider } from "../services/medical/finchnode";
import { seededNessieAccount } from "./nessie-seed";
import { MockCommunicationProvider } from "../services/communications/mock";

/** Selects local demo adapters unless real integrations are explicitly enabled. */
export const demoMode = () => process.env.DEMO_MODE !== "false";
/** With a scenario ID, reads that patient's seeded Nessie account when sandbox discovery is on, else the scenario's local payment. */
export const bankProvider = (scenarioId?: string) => {
  if (demoMode() && process.env.NESSIE_SANDBOX_DISCOVERY !== "true") return new MockBankProvider(scenarioId);
  if (!scenarioId) return new NessieBankProvider();
  const seeded = seededNessieAccount(scenarioId);
  if (!seeded) throw new Error(`Scenario ${scenarioId} has not been seeded into the Nessie sandbox; run scripts/nessie-seed.mjs`);
  return new NessieBankProvider([seeded]);
};
export const medicalProvider = () => demoMode() ? new ScenarioFinchNodeProvider() : new FinchNodeProvider();
export const communicationProvider = () => {
  if (!demoMode()) throw new Error("A Relay or Photon adapter must be configured before live provider contact");
  return new MockCommunicationProvider(process.env.DEMO_BILL_DELIVERY === "manual" ? Number.POSITIVE_INFINITY : 750);
};
