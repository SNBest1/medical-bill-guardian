import { describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { MockBankProvider } from "../banking/mock";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";
import { runAgentCommand } from "./run-command";
import { handlePatientDecision } from "./patient-decision";

const providers = { bank: (id: string) => new MockBankProvider(id), medical: new MockMedicalRecordProvider(), communications: Object.assign(new MockCommunicationProvider(Infinity), { requiresCallAuthorization: true }) };
describe("one active patient across text and web", () => {
  it("keeps Harriet current and rejects another patient without opening a case or contacting anyone", async () => {
    const store = new CaseStore(":memory:");
    await runAgentCommand(store, { text: "Harriet" }, providers);
    expect(store.activeCase()?.scenarioId).toBe("harriet-kidney");
    await expect(runAgentCommand(store, { scenarioId: "morgan-wellness" }, providers)).rejects.toThrow("One patient at a time");
    expect(store.list()).toHaveLength(1);
    expect(store.activeCase()?.communications).toHaveLength(0);
    expect((await handlePatientDecision(store, "yes Morgan", providers.communications))?.kind).toBe("ambiguous");
    expect(store.activeCase()?.communications).toHaveLength(0);
    expect((await handlePatientDecision(store, "yes", providers.communications))?.kind).toBe("approved");
    expect(store.activeCase()?.status).toBe("WAITING_FOR_BILL");
    store.close();
  });
  it("reserves one patient atomically and releases a failed unopened selection", () => {
    const store = new CaseStore(":memory:");
    expect(store.selectPatient("harriet-kidney")).toBe(true);
    expect(store.selectPatient("morgan-wellness")).toBe(false);
    store.releaseUnopenedPatient("harriet-kidney");
    expect(store.selectPatient("morgan-wellness")).toBe(true);
    store.close();
  });
});
