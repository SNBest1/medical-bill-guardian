import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { MockBankProvider } from "../banking/mock";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";
import { handlePatientCommand, type TextSender } from "./patient-command";
import { classifyPatientReply } from "./patient-intent";
import { handlePatientDecision } from "./patient-decision";
import { runAgentCommand } from "./run-command";
import { analyzeCase } from "./orchestrator";

const patient = "+15555550100";
const comms = () => new MockCommunicationProvider(Number.POSITIVE_INFINITY);
const providers = () => ({ bank: (id: string) => new MockBankProvider(id), medical: new MockMedicalRecordProvider(), communications: comms() });
const saved = ["PHOTON_UPDATE_TEXTS", "DEMO_MODE"].map((k) => [k, process.env[k]] as const);

describe("patient reply intents", () => {
  it("recognises short approvals, declines and status only", () => {
    for (const text of ["I’m done", "im done", "exit", "leave this investigation"]) expect(classifyPatientReply(text)).toEqual({ kind: "leave" });
    expect(classifyPatientReply("Yes!")).toEqual({ kind: "approve" });
    expect(classifyPatientReply("go ahead")).toEqual({ kind: "approve" });
    expect(classifyPatientReply("yes for Morgan")).toEqual({ kind: "approve", name: "morgan" });
    expect(classifyPatientReply("no")).toEqual({ kind: "decline" });
    expect(classifyPatientReply("Status?")).toEqual({ kind: "status" });
    for (const text of ["investigate Morgan's bill", "yes please call them and also dispute everything", "", "morgan"]) expect(classifyPatientReply(text)).toBeNull();
  });
});

describe("conversational approvals", () => {
  it("understands explicit natural language while rejecting conditions and additional actions", () => {
    expect(classifyPatientReply("Yes, call them and ask about the ECG")).toEqual({ kind: "approve", action: "review" });
    for (const text of ["Please get the bill.", "Request the bill", "Yes, get the bill"]) expect(classifyPatientReply(text)).toEqual({ kind: "approve", action: "request-bill" });
    for (const text of ["Yes, call them and ask about it.", "Call them and ask about that charge"]) expect(classifyPatientReply(text)).toEqual({ kind: "approve", action: "review" });
    expect(classifyPatientReply("Yes, request Morgan's itemized bill")).toEqual({ kind: "approve", name: "morgan", action: "request-bill" });
    expect(classifyPatientReply("Sure, go ahead!")).toEqual({ kind: "approve" });
    expect(classifyPatientReply("Don't call them yet")).toEqual({ kind: "decline" });
    expect(classifyPatientReply("No, don't call them")).toEqual({ kind: "decline" });
    expect(classifyPatientReply("What am I approving?")).toEqual({ kind: "status" });
    for (const text of ["yes, but only if it is free", "yes please call them and also dispute everything", "should I say yes?", "yes, call Morgan and Harriet", "yes, call them, actually don't"]) expect(classifyPatientReply(text)).toBeNull();
  });
});

describe("patient decisions by text", () => {
  let store: CaseStore;
  beforeEach(() => { store = new CaseStore(":memory:"); delete process.env.PHOTON_UPDATE_TEXTS; delete process.env.DEMO_MODE; });
  afterEach(() => { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const start = (name: string) => runAgentCommand(store, { text: name }, providers());

  it("lets the patient leave during ongoing work and choose another bill", async () => {
    const started = await start("Morgan");
    if (started.kind !== "started") throw new Error("Expected Morgan");
    store.save({ ...started.case, status: "WAITING_FOR_PROVIDER" });
    const outcome = await handlePatientDecision(store, "I'm done", comms());
    expect(outcome?.kind).toBe("declined");
    expect(store.activeCase()).toBeNull();
    expect(store.get(started.case.id)?.status).toBe("WAITING_FOR_PROVIDER");
    expect(store.selectPatient("harriet-kidney")).toBe(true);
    // A stale page's exit must not deselect the newly selected patient.
    store.leaveCase(started.case.id);
    expect(store.selectPatient("theo-asthma")).toBe(false);
  });

  it("does nothing for an approval when no step is waiting", async () => {
    expect((await handlePatientDecision(store, "yes", comms()))?.kind).toBe("nothing-pending");
    expect(await handlePatientDecision(store, "investigate Morgan", comms())).toBeNull();
  });
  it("YES authorizes the paused call, once", async () => {
    const started = await start("Morgan");
    const real = Object.assign(comms(), { requiresCallAuthorization: true });
    // re-open at the authorization checkpoint using a provider that requires it
    store.save({ ...started.kind === "started" ? started.case : (() => { throw new Error("x"); })(), status: "REQUESTING_BILL", communications: [] });
    const first = await handlePatientDecision(store, "yes", real);
    expect(first?.kind).toBe("approved");
    expect(store.list()[0].status).toBe("WAITING_FOR_BILL");
    expect((await handlePatientDecision(store, "yes", real))?.kind).toBe("nothing-pending");
  });
  it("applies an ordinary reply to the selected case and blocks a different action or patient", async () => {
    const started = await start("Morgan");
    if (started.kind !== "started") throw new Error("Expected Morgan");
    store.save({ ...started.case, status: "REQUESTING_BILL", communications: [] });
    expect((await handlePatientDecision(store, "yes, call them and ask about the ECG", comms()))?.kind).toBe("ambiguous");
    expect((await handlePatientDecision(store, "yes, request Harriet's itemized bill", comms()))?.kind).toBe("ambiguous");
    expect(store.get(started.case.id)?.status).toBe("REQUESTING_BILL");
    expect((await handlePatientDecision(store, "Please get the bill.", comms()))?.kind).toBe("approved");
    expect(store.get(started.case.id)?.status).toBe("WAITING_FOR_BILL");
    expect((await handlePatientDecision(store, "yes, request the itemized bill", comms()))?.kind).toBe("nothing-pending");
  });
  it("understands an ECG review approval and makes exactly one mock billing review", async () => {
    const started = await start("Morgan");
    if (started.kind !== "started") throw new Error("Expected Morgan");
    store.save(await analyzeCase(started.case, new MockCommunicationProvider(0)));
    expect(store.activeCase()?.status).toBe("REVIEW_REQUIRED");
    expect((await handlePatientDecision(store, "Don't call them yet", comms()))?.kind).toBe("declined");
    expect(store.activeCase()?.status).toBe("REVIEW_REQUIRED");
    expect((await handlePatientDecision(store, "Yes, call them and ask about it.", comms()))?.kind).toBe("approved");
    expect(store.activeCase()?.resolution?.correctedTotal).toBe(792);
    expect(store.activeCase()?.communications.filter((item) => item.type === "BILLING_REVIEW")).toHaveLength(1);
    // The same call-specific reply must not accidentally approve the newly offered refund.
    expect((await handlePatientDecision(store, "Yes, call them and ask about the ECG", comms()))?.kind).toBe("ambiguous");
    expect(store.activeCase()?.recovery?.status).toBe("REFUND_PENDING");
  });
  it("offers and credits a pending refund through text exactly once", async () => {
    const started = await start("Morgan");
    if (started.kind !== "started") throw new Error("Expected Morgan");
    const c = { ...started.case, status: "USER_NOTIFIED" as const, resolution: { originalTotal: 1102, correctedTotal: 792, adjustment: 310, result: "DUPLICATE_REMOVED" as const, explanation: "Hospital corrected the charge" }, recovery: { status: "REFUND_PENDING" as const, amount: 310, confirmation: "demo", simulated: true } };
    store.save(c);
    expect((await handlePatientDecision(store, "status", comms()))?.text).toContain("Want me to send");
    expect((await handlePatientDecision(store, "no", comms()))?.kind).toBe("declined");
    expect(store.get(c.id)?.recovery?.status).toBe("REFUND_PENDING");
    expect((await handlePatientDecision(store, "yes Harriet", comms()))?.kind).toBe("ambiguous");
    const sent: string[] = [];
    const options = { replyEnabled: true, patientPhone: patient, send: async (_p: string, text: string) => { sent.push(text); return "credit-message"; } };
    expect(await handlePatientCommand(store, { messageId: "refund-yes", text: "send it" }, providers(), options)).toEqual({ kind: "approved", reply: "sent" });
    expect(store.get(c.id)?.recovery?.status).toBe("REFUND_RECEIVED");
    expect(sent[0]).toContain("$310");
    expect(sent[0]).toContain("no real money moved");
    expect(await handlePatientCommand(store, { messageId: "refund-yes", text: "send it" }, providers(), options)).toEqual({ kind: "duplicate" });
    expect((await handlePatientDecision(store, "send it", comms()))?.text).toContain("already been recorded");
  });
  it("never treats a refund request as authorization to call the hospital", async () => {
    const started = await start("Morgan");
    if (started.kind !== "started") throw new Error("Expected Morgan");
    store.save({ ...started.case, status: "REQUESTING_BILL", communications: [] });
    expect((await handlePatientDecision(store, "send my money back now", comms()))?.kind).toBe("nothing-pending");
    expect(store.get(started.case.id)?.status).toBe("REQUESTING_BILL");
  });
  it("NO leaves the case untouched and says nothing was sent", async () => {
    const started = await start("Morgan");
    if (started.kind !== "started") throw new Error("x");
    store.save({ ...started.case, status: "REQUESTING_BILL", communications: [] });
    const out = await handlePatientDecision(store, "no", comms());
    expect(out?.kind).toBe("declined");
    expect(out?.text).toContain("Nothing has been sent");
    expect(store.list()[0].status).toBe("REQUESTING_BILL");
  });
  it("status reports the latest case", async () => {
    await start("Morgan");
    const out = await handlePatientDecision(store, "status", comms());
    expect(out?.kind).toBe("status");
    expect(out?.text).toContain("bill");
  });
  it("replies through the text path and stays quiet on approval when progress updates already text", async () => {
    const sent: string[] = [];
    const send: TextSender = async (_p, t) => { sent.push(t); return `id${sent.length}`; };
    const started = await start("Morgan");
    if (started.kind !== "started") throw new Error("x");
    store.save({ ...started.case, status: "REQUESTING_BILL", communications: [] });
    const result = await handlePatientCommand(store, { messageId: "m9", text: "yes" }, providers(), { replyEnabled: true, patientPhone: patient, send });
    expect(result).toEqual({ kind: "approved", reply: "sent" });
    expect(sent[0]).toContain("Approved");
  });
});
