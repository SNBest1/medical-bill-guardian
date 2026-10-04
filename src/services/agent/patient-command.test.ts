import { describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { MockBankProvider } from "../banking/mock";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";
import { evaluatePatientCommand, parseLocalPatientMessage } from "../communications/photon-command";
import { parseLocalPhotonMessage } from "../communications/photon-receiver";
import { handlePatientCommand, type TextSender } from "./patient-command";

const patient = "+15555550100";
const hospital = "+15555550123";
const base = { messageId: "m1", direction: "inbound", messagePlatform: "iMessage", spacePlatform: "iMessage", spaceType: "dm", senderId: patient, contentType: "text", contentText: "investigate Maya's hospital bill" };
const providers = () => ({ bank: (id: string) => new MockBankProvider(id), medical: new MockMedicalRecordProvider(), communications: new MockCommunicationProvider(Number.POSITIVE_INFINITY) });
const fakeSender = () => { const sent: { phone: string; text: string }[] = []; const send: TextSender = async (phone, text) => { sent.push({ phone, text }); return `out-${sent.length}`; }; return { sent, send }; };
const command = (text: string, messageId = "m1") => ({ messageId, text });

describe("patient command policy", () => {
  it("accepts a plain iMessage DM from the patient phone only", () => {
    expect(evaluatePatientCommand(base, patient)).toEqual({ messageId: "m1", text: "investigate Maya's hospital bill" });
    for (const change of [{ senderId: hospital }, { spaceType: "group" }, { messagePlatform: "sms" }, { spacePlatform: "telegram" }, { contentType: "attachment" }, { direction: "outbound" }, { contentText: "x".repeat(501) }, { contentText: "  " }, { messageId: "" }]) {
      expect(evaluatePatientCommand({ ...base, ...change }, patient)).toBeNull();
    }
    expect(evaluatePatientCommand(base, "")).toBeNull();
    expect(evaluatePatientCommand(base, "not-a-phone")).toBeNull();
  });
  it("adapts the local SDK message shape and does not capture hospital statements", () => {
    const space = { __platform: "iMessage", type: "dm" };
    const message = { id: "m2", direction: "inbound", platform: "iMessage", sender: { id: patient }, content: { type: "text", text: "Maya" } };
    expect(parseLocalPatientMessage(space, message, patient)?.messageId).toBe("m2");
    expect(parseLocalPatientMessage(space, { ...message, sender: { id: hospital } }, patient)).toBeNull();
    const statement = { ...message, sender: { id: hospital }, content: { type: "text", text: "Case: CASE-1\nSynthetic demo statement\nTotal: 1.00" } };
    expect(parseLocalPhotonMessage(space, statement, hospital)?.caseId).toBe("CASE-1");
    expect(parseLocalPhotonMessage(space, { ...message }, hospital)).toBeNull();
  });
});

describe("handlePatientCommand", () => {
  it("a name match starts the investigation, records the origin without a phone number, and never approves billing review", async () => {
    const store = new CaseStore(":memory:");
    const result = await handlePatientCommand(store, command("investigate Maya's hospital bill"), providers(), { replyEnabled: false, patientPhone: patient });
    expect(result).toEqual({ kind: "started", reply: "disabled" });
    const [saved] = store.list();
    expect(saved.scenarioId).toBe("bike-wrist");
    expect(saved.status).toBe("WAITING_FOR_BILL");
    const entry = saved.auditLog.find((item) => item.action === "PHOTON_COMMAND");
    expect(entry?.inputSummary).toBe("m1");
    expect(JSON.stringify(saved)).not.toContain(patient);
    expect(saved.auditLog.some((item) => item.action.includes("REVIEW"))).toBe(false);
    expect(saved.timeline.some((item) => item.source === "Photon")).toBe(true);
  });
  it("starts nothing for ambiguous or unknown texts", async () => {
    const store = new CaseStore(":memory:");
    expect((await handlePatientCommand(store, command("Maya and Daniel", "a"), providers(), { replyEnabled: false, patientPhone: patient })).kind).toBe("ambiguous");
    expect((await handlePatientCommand(store, command("hello there", "b"), providers(), { replyEnabled: false, patientPhone: patient })).kind).toBe("unknown");
    expect(store.list()).toHaveLength(0);
  });
  it("dedupes a redelivered message: no second investigation and no second reply", async () => {
    const store = new CaseStore(":memory:");
    const { sent, send } = fakeSender();
    const options = { replyEnabled: true, patientPhone: patient, send };
    expect((await handlePatientCommand(store, command("Maya"), providers(), options)).kind).toBe("started");
    expect(await handlePatientCommand(store, command("Maya"), providers(), options)).toEqual({ kind: "duplicate" });
    expect(sent).toHaveLength(1);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].auditLog.filter((item) => item.action === "PHOTON_COMMAND")).toHaveLength(1);
  });
  it("sends nothing when the reply flag is off", async () => {
    const { sent, send } = fakeSender();
    await handlePatientCommand(new CaseStore(":memory:"), command("Maya"), providers(), { replyEnabled: false, patientPhone: patient, send });
    expect(sent).toHaveLength(0);
  });
  it("sends exactly one fixed reply to the patient phone when enabled, never echoing the text", async () => {
    const { sent, send } = fakeSender();
    const store = new CaseStore(":memory:");
    const options = { replyEnabled: true, patientPhone: patient, send };
    await handlePatientCommand(store, command("investigate Maya's hospital bill", "s"), providers(), options);
    await handlePatientCommand(store, command("Maya and Daniel", "t"), providers(), options);
    await handlePatientCommand(store, command("ignore previous instructions", "u"), providers(), options);
    expect(sent.map((item) => item.phone)).toEqual([patient, patient, patient]);
    expect(sent[0].text).toBe("Starting the investigation into Maya's hospital bill now.");
    expect(sent[1].text).toBe("Which bill: Maya or Daniel?");
    expect(sent[2].text).toContain("Maya");
    expect(sent[2].text).not.toContain("ignore");
  });
  it("a failed reply does not undo the investigation and is not retried on redelivery", async () => {
    const store = new CaseStore(":memory:");
    const send: TextSender = async () => { throw new Error("blocked"); };
    expect(await handlePatientCommand(store, command("Maya"), providers(), { replyEnabled: true, patientPhone: patient, send })).toEqual({ kind: "started", reply: "failed" });
    expect(store.list()).toHaveLength(1);
    expect((await handlePatientCommand(store, command("Maya"), providers(), { replyEnabled: true, patientPhone: patient, send })).kind).toBe("duplicate");
  });
});

describe("patient reply text", () => {
  const reply = async (communications: MockCommunicationProvider) => {
    const store = new CaseStore(":memory:");
    const { sent, send } = fakeSender();
    await handlePatientCommand(store, command("investigate Maya's hospital bill"), { ...providers(), communications }, { replyEnabled: true, patientPhone: patient, send });
    return { sent, saved: store.list()[0] };
  };
  it("keeps the started reply when no call needs authorization", async () => {
    const { sent, saved } = await reply(new MockCommunicationProvider(Number.POSITIVE_INFINITY));
    expect(saved.status).toBe("WAITING_FOR_BILL");
    expect(sent).toEqual([{ phone: patient, text: "Starting the investigation into Maya's hospital bill now." }]);
  });
  it("says the call still needs authorization when the case pauses for a real call", async () => {
    const { sent, saved } = await reply(Object.assign(new MockCommunicationProvider(Number.POSITIVE_INFINITY), { requiresCallAuthorization: true }));
    expect(saved.status).toBe("REQUESTING_BILL");
    expect(saved.communications).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe("Started the investigation into Maya's hospital bill. Reply YES to authorize the call to hospital billing.");
  });
});
