import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { MockBankProvider } from "../banking/mock";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";
import { handlePatientCommand, type TextSender } from "./patient-command";
import { classifyPatientReply } from "./patient-intent";
import { handlePatientDecision } from "./patient-decision";
import { runAgentCommand } from "./run-command";

const patient = "+15555550100";
const comms = () => new MockCommunicationProvider(Number.POSITIVE_INFINITY);
const providers = () => ({ bank: (id: string) => new MockBankProvider(id), medical: new MockMedicalRecordProvider(), communications: comms() });
const saved = ["PHOTON_UPDATE_TEXTS", "DEMO_MODE"].map((k) => [k, process.env[k]] as const);

describe("patient reply intents", () => {
  it("recognises short approvals, declines and status only", () => {
    expect(classifyPatientReply("Yes!")).toEqual({ kind: "approve" });
    expect(classifyPatientReply("go ahead")).toEqual({ kind: "approve" });
    expect(classifyPatientReply("yes for Maya")).toEqual({ kind: "approve", name: "maya" });
    expect(classifyPatientReply("no")).toEqual({ kind: "decline" });
    expect(classifyPatientReply("Status?")).toEqual({ kind: "status" });
    for (const text of ["investigate Maya's bill", "yes please call them and also dispute everything", "", "maya"]) expect(classifyPatientReply(text)).toBeNull();
  });
});

describe("patient decisions by text", () => {
  let store: CaseStore;
  beforeEach(() => { store = new CaseStore(":memory:"); delete process.env.PHOTON_UPDATE_TEXTS; delete process.env.DEMO_MODE; });
  afterEach(() => { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const start = (name: string) => runAgentCommand(store, { text: name }, providers());

  it("does nothing for an approval when no step is waiting", async () => {
    expect((await handlePatientDecision(store, "yes", comms()))?.kind).toBe("nothing-pending");
    expect(await handlePatientDecision(store, "investigate Maya", comms())).toBeNull();
  });
  it("YES authorizes the paused call, once", async () => {
    const started = await start("Maya");
    const real = Object.assign(comms(), { requiresCallAuthorization: true });
    // re-open at the authorization checkpoint using a provider that requires it
    store.save({ ...started.kind === "started" ? started.case : (() => { throw new Error("x"); })(), status: "REQUESTING_BILL", communications: [] });
    const first = await handlePatientDecision(store, "yes", real);
    expect(first?.kind).toBe("approved");
    expect(store.list()[0].status).toBe("WAITING_FOR_BILL");
    expect((await handlePatientDecision(store, "yes", real))?.kind).toBe("nothing-pending");
  });
  it("NO leaves the case untouched and says nothing was sent", async () => {
    const started = await start("Maya");
    if (started.kind !== "started") throw new Error("x");
    store.save({ ...started.case, status: "REQUESTING_BILL", communications: [] });
    const out = await handlePatientDecision(store, "no", comms());
    expect(out?.kind).toBe("declined");
    expect(out?.text).toContain("Nothing has been sent");
    expect(store.list()[0].status).toBe("REQUESTING_BILL");
  });
  it("status reports the latest case", async () => {
    await start("Maya");
    const out = await handlePatientDecision(store, "status", comms());
    expect(out?.kind).toBe("status");
    expect(out?.text).toContain("bill");
  });
  it("replies through the text path and stays quiet on approval when progress updates already text", async () => {
    const sent: string[] = [];
    const send: TextSender = async (_p, t) => { sent.push(t); return `id${sent.length}`; };
    const started = await start("Maya");
    if (started.kind !== "started") throw new Error("x");
    store.save({ ...started.case, status: "REQUESTING_BILL", communications: [] });
    const result = await handlePatientCommand(store, { messageId: "m9", text: "yes" }, providers(), { replyEnabled: true, patientPhone: patient, send });
    expect(result).toEqual({ kind: "approved", reply: "sent" });
    expect(sent[0]).toContain("Approved");
  });
});
