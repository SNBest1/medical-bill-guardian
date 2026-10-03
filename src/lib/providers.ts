import { MockBankProvider } from "../services/banking/mock";
import { NessieBankProvider } from "../services/banking/nessie";
import { MockMedicalRecordProvider } from "../services/medical/mock";
import { FinchNodeProvider } from "../services/medical/finchnode";
import { MockCommunicationProvider } from "../services/communications/mock";

/** Selects local demo adapters unless real integrations are explicitly enabled. */
export const demoMode = () => process.env.DEMO_MODE !== "false";
export const bankProvider = () => demoMode() ? new MockBankProvider() : new NessieBankProvider();
export const medicalProvider = () => demoMode() ? new MockMedicalRecordProvider() : new FinchNodeProvider();
export const communicationProvider = () => {
  if (!demoMode()) throw new Error("A Relay or Photon adapter must be configured before live provider contact");
  return new MockCommunicationProvider();
};
