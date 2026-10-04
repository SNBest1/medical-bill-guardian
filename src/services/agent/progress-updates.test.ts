import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { PhotonSendUncertainError } from "../communications/photon-text";
import { createCase } from "./orchestrator";
import { currentMilestone, sendProgressUpdate, sendPendingProgressUpdates } from "./progress-updates";
import type { MedicalBillCase } from "../../types/domain";

const tx = { id: "t1", merchant: "University Hospital", amount: 4820, date: "2026-09-28" };
const at = (status: MedicalBillCase["status"]) => ({ ...createCase(tx), status });
const sender = () => { const sent: string[] = []; return { sent, send: async (_p: string, t: string) => { sent.push(t); return `id-${sent.length}`; } }; };
const saved = ["PHOTON_UPDATE_TEXTS", "DEMO_PATIENT_PHONE", "DEMO_MODE"].map((k) => [k, process.env[k]] as const);

describe("progress updates", () => {
  let store: CaseStore;
  beforeEach(() => { store = new CaseStore(":memory:"); process.env.PHOTON_UPDATE_TEXTS = "true"; process.env.DEMO_PATIENT_PHONE = "+15555550100"; delete process.env.DEMO_MODE; });
  afterEach(() => { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  it("has a message for each waiting/decision point and none for transient states", () => {
    expect(currentMilestone(at("REQUESTING_BILL"))?.milestone).toBe("RECORDS_FOUND");
    expect(currentMilestone(at("WAITING_FOR_BILL"))?.milestone).toBe("BILL_REQUESTED");
    expect(currentMilestone(at("WAITING_FOR_PROVIDER"))?.milestone).toBe("HOSPITAL_CONTACTED");
    expect(currentMilestone(at("ANALYZING"))).toBeNull();
    expect(currentMilestone(at("DETECTED"))).toBeNull();
  });
  it("sends each milestone once, only when opted in", async () => {
    const c = at("WAITING_FOR_BILL"); store.create(c);
    const { sent, send } = sender();
    process.env.PHOTON_UPDATE_TEXTS = "false";
    expect(await sendProgressUpdate(store, c, send)).toBe("skipped");
    process.env.PHOTON_UPDATE_TEXTS = "true";
    expect(await sendProgressUpdate(store, c, send)).toBe("sent");
    expect(await sendProgressUpdate(store, c, send)).toBe("skipped");
    expect(sent).toHaveLength(1);
  });
  it("retries a send that never left, but never resends an uncertain one", async () => {
    const c = at("WAITING_FOR_BILL"); store.create(c);
    expect(await sendProgressUpdate(store, c, async () => { throw new Error("no creds"); })).toBe("failed");
    const { sent, send } = sender();
    expect(await sendProgressUpdate(store, c, send)).toBe("sent");
    const d = at("REQUESTING_BILL"); d.id = "CASE-2"; d.transaction = { ...tx, id: "t2" }; store.create(d);
    expect(await sendProgressUpdate(store, d, async () => { throw new PhotonSendUncertainError("x"); })).toBe("uncertain");
    expect(await sendProgressUpdate(store, d, send)).toBe("skipped");
    expect(sent).toHaveLength(1);
  });
  it("sweeps stored cases", async () => {
    store.create(at("WAITING_FOR_BILL"));
    const { sent, send } = sender();
    expect(await sendPendingProgressUpdates(store, send)).toBe(1);
    expect(await sendPendingProgressUpdates(store, send)).toBe(0);
    expect(sent[0]).toContain("itemized statement");
  });
  it("shares website milestones with texts, dedupes reads, and permits updates after a new demo run", async () => {
    const c = { ...at("REQUESTING_BILL"), scenarioId: "harriet-kidney" };
    store.create(c);
    const { sent, send } = sender();
    expect(await sendProgressUpdate(store, c, send)).toBe("sent");
    expect(sent[0]).toContain("Harriet");
    expect(sent[0]).toContain("yes, request the itemized bill");
    expect(await sendPendingProgressUpdates(store, send)).toBe(0);
    const next = { ...c, status: "WAITING_FOR_BILL" as const };
    store.save(next);
    expect(await sendPendingProgressUpdates(store, send)).toBe(1);
    const restarted = { ...c, auditLog: [{ ...c.auditLog[0], id: "new-run" }] };
    store.save(restarted);
    expect(await sendPendingProgressUpdates(store, send)).toBe(1);
    expect(sent).toHaveLength(3);
  });

});
