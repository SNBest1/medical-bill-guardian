import { MockBankProvider } from "../services/banking/mock";
import { NessieBankProvider } from "../services/banking/nessie";
import { MockMedicalRecordProvider } from "../services/medical/mock";
import { FinchNodeProvider } from "../services/medical/finchnode";
import { FishDemoCommunicationProvider } from "../services/communications/fish-demo";
import { MockCommunicationProvider } from "../services/communications/mock";

/** Selects local demo adapters unless real integrations are explicitly enabled. */
export const demoMode = () => process.env.DEMO_MODE !== "false";
export const bankProvider = () => demoMode() ? new MockBankProvider() : new NessieBankProvider();
export const medicalProvider = () => demoMode() ? new MockMedicalRecordProvider() : new FinchNodeProvider();
export const communicationProvider = () => {
  if (!demoMode()) throw new Error("A Relay or Photon adapter must be configured before live provider contact");
  const fishConfig = {
    apiKey: process.env.FISH_API_KEY?.trim() ?? "",
    agentId: process.env.FISH_AGENT_ID?.trim() ?? "",
    phoneNumberId: process.env.FISH_PHONE_NUMBER_ID?.trim() ?? "",
    toNumber: process.env.FISH_TEST_TO_NUMBER?.trim() ?? "",
  };
  if (Object.values(fishConfig).every(Boolean)) return new FishDemoCommunicationProvider(fishConfig);
  return new MockCommunicationProvider();
};
