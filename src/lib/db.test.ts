import { describe, expect, it } from "vitest";
import { CaseStore } from "./db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("case operation guard", () => {
  it("persists across connections and permits only the owner's release", () => {
    const directory = mkdtempSync(join(tmpdir(), "guardian-lock-"));
    const path = join(directory, "cases.sqlite");
    const first = new CaseStore(path);
    const second = new CaseStore(path);
    try {
      const token = first.acquireOperation("case-1")!;
      expect(token).toBeTruthy();
      expect(second.acquireOperation("case-1")).toBeNull();
      second.releaseOperation("case-1", "wrong-token");
      expect(second.acquireOperation("case-1")).toBeNull();
      first.close();
      expect(second.acquireOperation("case-1")).toBeNull();
      second.releaseOperation("case-1", token);
      expect(second.acquireOperation("case-1")).toBeTruthy();
    } finally {
      second.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("lets an operator inspect an active operation's age and force-release it", () => {
    const store = new CaseStore(":memory:");
    try {
      expect(store.operationInfo("case-1")).toBeNull();
      const token = store.acquireOperation("case-1")!;
      const info = store.operationInfo("case-1");
      expect(info?.startedAt).toBeTruthy();
      expect(store.acquireOperation("case-1")).toBeNull();
      store.forceReleaseOperation("case-1");
      expect(store.operationInfo("case-1")).toBeNull();
      expect(store.acquireOperation("case-1")).toBeTruthy();
      void token;
    } finally { store.close(); }
  });
});

describe("patient authorization", () => {
  it("is explicit, scoped, and single-use by revocation, never inferred from a payment", () => {
    const store = new CaseStore(":memory:");
    try {
      expect(store.getAuthorization("case-1")).toBeNull();
      store.grantAuthorization("case-1", "INVESTIGATE", new Date(Date.now() + 60_000).toISOString());
      const live = store.getAuthorization("case-1");
      expect(live?.scope).toBe("INVESTIGATE");
      store.revokeAuthorization("case-1");
      expect(store.getAuthorization("case-1")).toBeNull();
    } finally { store.close(); }
  });

  it("treats an expired grant as absent and prunes it", () => {
    const store = new CaseStore(":memory:");
    try {
      store.grantAuthorization("case-1", "INVESTIGATE", new Date(Date.now() - 1_000).toISOString());
      expect(store.getAuthorization("case-1")).toBeNull();
    } finally { store.close(); }
  });
});

describe("Photon outbox", () => {
  it("dedupes concurrent sends and distinguishes a definite failure (free retry) from an uncertain one (needs recovery)", () => {
    const store = new CaseStore(":memory:");
    try {
      expect(store.beginText("case-1:REQUEST_STATEMENT")).toBe(true);
      expect(store.beginText("case-1:REQUEST_STATEMENT")).toBe(false);

      // A send attempt that never reached the provider is always safe to retry on its own.
      store.failText("case-1:REQUEST_STATEMENT");
      expect(store.textStatus("case-1:REQUEST_STATEMENT")?.status).toBe("FAILED");
      expect(store.beginText("case-1:REQUEST_STATEMENT")).toBe(false);
      expect(store.retryText("case-1:REQUEST_STATEMENT")).toBe(true);
      expect(store.textStatus("case-1:REQUEST_STATEMENT")?.status).toBe("SENDING");
      expect(store.retryText("case-1:REQUEST_STATEMENT")).toBe(false);

      // An attempt that did reach the provider but whose outcome is unknown must not be retried silently.
      store.finishText("case-1:REQUEST_STATEMENT");
      expect(store.textStatus("case-1:REQUEST_STATEMENT")?.status).toBe("UNCERTAIN");
      expect(store.retryText("case-1:REQUEST_STATEMENT")).toBe(false);
      expect(store.beginText("case-1:REQUEST_STATEMENT")).toBe(false);

      // Recovery is an explicit, one-time operator decision — never automatic.
      expect(store.recoverText("case-1:REQUEST_STATEMENT", "DELIVERED", "msg-123")).toBe(true);
      expect(store.textStatus("case-1:REQUEST_STATEMENT")).toEqual({ status: "ACCEPTED", message_id: "msg-123" });
      expect(store.recoverText("case-1:REQUEST_STATEMENT", "FAILED")).toBe(false);

      // A confirmed acceptance always dedupes as the final state.
      store.finishText("case-2:NOTIFY_PATIENT", "msg-456");
      expect(store.textStatus("case-2:NOTIFY_PATIENT")).toBeNull();
      expect(store.beginText("case-2:NOTIFY_PATIENT")).toBe(true);
      store.finishText("case-2:NOTIFY_PATIENT", "msg-456");
      expect(store.textStatus("case-2:NOTIFY_PATIENT")).toEqual({ status: "ACCEPTED", message_id: "msg-456" });
      expect(store.beginText("case-2:NOTIFY_PATIENT")).toBe(false);
      expect(store.retryText("case-2:NOTIFY_PATIENT")).toBe(false);
    } finally { store.close(); }
  });

  it("recovers an uncertain record to FAILED and only then allows a retry", () => {
    const store = new CaseStore(":memory:");
    try {
      store.beginText("case-3:NOTIFY_PATIENT");
      store.finishText("case-3:NOTIFY_PATIENT");
      expect(store.retryText("case-3:NOTIFY_PATIENT")).toBe(false);
      expect(store.recoverText("case-3:NOTIFY_PATIENT", "FAILED")).toBe(true);
      expect(store.textStatus("case-3:NOTIFY_PATIENT")?.status).toBe("FAILED");
      expect(store.retryText("case-3:NOTIFY_PATIENT")).toBe(true);
    } finally { store.close(); }
  });
});

describe("restart durability", () => {
  it("persists outbox and inbox state so a freshly-constructed store (simulating a restart) sees it unchanged", () => {
    const directory = mkdtempSync(join(tmpdir(), "guardian-restart-"));
    const path = join(directory, "cases.sqlite");
    const before = new CaseStore(path);
    try {
      before.beginText("case-1:REQUEST_STATEMENT");
      before.finishText("case-1:REQUEST_STATEMENT", "msg-1");
      before.enqueueStatement({ messageId: "restart-msg-1", caseId: "case-1", sender: "+15555550123", statement: "Invoice: UH-1\nProvider: X\nService date: 2026-01-01\nCharges\nA | - | 1.00\nTotal: 1.00" });
    } finally { before.close(); }

    // A brand-new instance against the same file stands in for the process restarting.
    const after = new CaseStore(path);
    try {
      expect(after.textStatus("case-1:REQUEST_STATEMENT")).toEqual({ status: "ACCEPTED", message_id: "msg-1" });
      expect(after.beginText("case-1:REQUEST_STATEMENT")).toBe(false);
      expect(after.pendingStatements().map((s) => s.messageId)).toEqual(["restart-msg-1"]);
      expect(after.enqueueStatement({ messageId: "restart-msg-1", caseId: "case-1", sender: "+15555550123", statement: "resent" })).toBe(false);
    } finally {
      after.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
