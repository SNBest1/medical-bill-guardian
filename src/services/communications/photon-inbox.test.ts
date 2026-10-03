import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { createCase, investigateCase } from "../agent/orchestrator";
import { MockCommunicationProvider } from "./mock";
import { MockMedicalRecordProvider } from "../medical/mock";
import { demoStatement, demoTransaction } from "../demo";
import { parsePhotonStatement, processPhotonInbox, verifyPhotonSignature } from "./photon-inbox";

const phone = "+15555550123";
const payload = (text = `Case: CASE-4821\nSynthetic demo statement\n${demoStatement}`) => ({ event: "messages", space: { platform: "iMessage", type: "dm" }, message: { id: "message-1", platform: "iMessage", direction: "inbound", sender: { id: phone }, content: { type: "text", text } } });

describe("signed Photon statement inbox", () => {
  it("verifies exact raw bytes and rejects tampering, missing auth and stale/future timestamps", () => {
    const now = 1800000000000;
    const timestamp = String(now / 1000);
    const raw = Buffer.from(JSON.stringify(payload()));
    const headers = new Headers({ "x-spectrum-timestamp": timestamp, "x-spectrum-signature": `v0=${createHmac("sha256", "secret").update(`v0:${timestamp}:`).update(raw).digest("hex")}` });
    expect(verifyPhotonSignature(raw, headers, "secret", now)).toBe(true);
    expect(verifyPhotonSignature(Buffer.concat([raw, Buffer.from(" ")]), headers, "secret", now)).toBe(false);
    expect(verifyPhotonSignature(raw, headers, "secret", now + 301000)).toBe(false);
    expect(verifyPhotonSignature(raw, headers, "secret", now - 301000)).toBe(false);
    expect(verifyPhotonSignature(raw, new Headers(), "secret", now)).toBe(false);
  });

  it("does not accept patient senders, group messages, attachments, or unlabelled patient records", () => {
    expect(parsePhotonStatement(payload(), phone)?.caseId).toBe("CASE-4821");
    expect(parsePhotonStatement(payload(), "+15555550124")).toBeNull();
    expect(parsePhotonStatement({ ...payload(), space: { platform: "iMessage", type: "group" } }, phone)).toBeNull();
    expect(parsePhotonStatement(payload(demoStatement), phone)).toBeNull();
    const value = payload();
    expect(parsePhotonStatement({ ...value, message: { ...value.message, content: { type: "attachment", id: "file" } } }, phone)).toBeNull();
  });

  it("deduplicates delivery, waits for an active case operation, and atomically applies a statement", async () => {
    const store = new CaseStore(":memory:");
    try {
      const current = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), new MockCommunicationProvider());
      store.create(current);
      const entry = parsePhotonStatement(payload(), phone)!;
      expect(store.enqueueStatement(entry)).toBe(true);
      expect(store.enqueueStatement(entry)).toBe(false);
      const token = store.acquireOperation(current.id)!;
      expect(processPhotonInbox(store)).toEqual({ applied: 0, rejected: 0, deferred: 1 });
      store.releaseOperation(current.id, token);
      expect(processPhotonInbox(store)).toEqual({ applied: 1, rejected: 0, deferred: 0 });
      expect(store.get(current.id)?.status).toBe("REVIEW_REQUIRED");
      expect(store.get(current.id)?.auditLog.filter((entry) => entry.action === "PHOTON_STATEMENT")).toHaveLength(1);
      expect(processPhotonInbox(store).applied).toBe(0);
      expect(store.enqueueStatement(entry)).toBe(false);
    } finally { store.close(); }
  });

  it("rejects wrong-case/provider statements without mutating a case", async () => {
    const store = new CaseStore(":memory:");
    try {
      const current = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), new MockCommunicationProvider());
      store.create(current);
      store.enqueueStatement({ messageId: "bad", caseId: current.id, sender: phone, statement: demoStatement.replace("University Hospital", "Different Hospital") });
      expect(processPhotonInbox(store).rejected).toBe(1);
      expect(store.get(current.id)?.bill).toBeNull();
      expect(store.pendingStatements()).toEqual([]);
    } finally { store.close(); }
  });

  it("survives a process restart mid-flight: a statement queued before the crash is applied exactly once after", async () => {
    const directory = mkdtempSync(join(tmpdir(), "guardian-photon-restart-"));
    const path = join(directory, "cases.sqlite");
    const before = new CaseStore(path);
    let caseId: string;
    try {
      const current = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider(), new MockCommunicationProvider());
      before.create(current);
      caseId = current.id;
      const entry = parsePhotonStatement(payload(), phone)!;
      expect(before.enqueueStatement(entry)).toBe(true);
      // The process "crashes" here: before a worker tick ever drains the inbox.
    } finally { before.close(); }

    // A fresh store against the same file stands in for the restarted process.
    const after = new CaseStore(path);
    try {
      expect(after.pendingStatements().map((s) => s.messageId)).toEqual(["message-1"]);
      expect(processPhotonInbox(after)).toEqual({ applied: 1, rejected: 0, deferred: 0 });
      expect(after.get(caseId!)?.status).toBe("REVIEW_REQUIRED");
      // A redelivered retry of the same signed message after the restart must not re-apply or re-dispatch.
      const retried = parsePhotonStatement(payload(), phone)!;
      expect(after.enqueueStatement(retried)).toBe(false);
      expect(processPhotonInbox(after).applied).toBe(0);
    } finally {
      after.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
