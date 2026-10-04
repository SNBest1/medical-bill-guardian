import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { MedicalBillCase } from "../types/domain";
import type { PhotonStatement } from "../services/communications/photon-inbox";

export class CaseStore {
  private db: DatabaseSync;

  /** Opens the local case database and creates its schema if needed. */
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS case_operations (case_id TEXT PRIMARY KEY, token TEXT NOT NULL, started_at TEXT NOT NULL)");
    this.db.exec("CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, updated_at TEXT NOT NULL)");
    this.db.exec("CREATE TABLE IF NOT EXISTS statement_inbox (message_id TEXT PRIMARY KEY, case_id TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', received_at TEXT NOT NULL, error TEXT)");
    this.db.exec("CREATE TABLE IF NOT EXISTS photon_outbox (operation_key TEXT PRIMARY KEY, status TEXT NOT NULL, message_id TEXT, updated_at TEXT NOT NULL)");
    this.db.exec("CREATE TABLE IF NOT EXISTS command_inbox (message_id TEXT PRIMARY KEY, status TEXT NOT NULL, received_at TEXT NOT NULL)");
    this.db.exec("CREATE TABLE IF NOT EXISTS case_authorizations (case_id TEXT PRIMARY KEY, scope TEXT NOT NULL, granted_at TEXT NOT NULL, expires_at TEXT NOT NULL)");
  }

  /** Returns all cases, newest first. */
  list(): MedicalBillCase[] {
    return (this.db.prepare("SELECT data FROM cases ORDER BY updated_at DESC").all() as { data: string }[]).map((row) => JSON.parse(row.data));
  }

  /** Returns a case by ID. */
  get(id: string): MedicalBillCase | null {
    const row = this.db.prepare("SELECT data FROM cases WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /** Returns the existing case when the transaction was already scanned. */
  create(caseData: MedicalBillCase): MedicalBillCase {
    const row = this.db.prepare("SELECT data FROM cases WHERE transaction_id = ?").get(caseData.transaction.id) as { data: string } | undefined;
    if (row) return JSON.parse(row.data);
    this.db.prepare("INSERT OR IGNORE INTO cases (id, transaction_id, data, updated_at) VALUES (?, ?, ?, ?)").run(caseData.id, caseData.transaction.id, JSON.stringify(caseData), caseData.updatedAt);
    const saved = this.db.prepare("SELECT data FROM cases WHERE transaction_id = ?").get(caseData.transaction.id) as { data: string } | undefined;
    if (!saved) throw new Error("Case identity conflicts with an existing transaction");
    return JSON.parse(saved.data);
  }

  /** Persists the latest case state. */
  save(caseData: MedicalBillCase): void {
    this.db.prepare("UPDATE cases SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(caseData), caseData.updatedAt, caseData.id);
  }

  /** Durable single-operation guard; abandoned operations require review rather than silent retry. */
  acquireOperation(caseId: string): string | null {
    const token = crypto.randomUUID();
    const result = this.db.prepare("INSERT OR IGNORE INTO case_operations (case_id, token, started_at) VALUES (?, ?, ?)").run(caseId, token, new Date().toISOString());
    return result.changes === 1 ? token : null;
  }

  /** Releases only the operation owned by this caller. */
  releaseOperation(caseId: string, token: string): void {
    this.db.prepare("DELETE FROM case_operations WHERE case_id = ? AND token = ?").run(caseId, token);
  }

  /** Reports an active operation's age without exposing its token, for operator recovery. */
  operationInfo(caseId: string): { startedAt: string } | null {
    const row = this.db.prepare("SELECT started_at FROM case_operations WHERE case_id = ?").get(caseId) as { started_at: string } | undefined;
    return row ? { startedAt: row.started_at } : null;
  }

  /** Operator-only: releases a guard regardless of owner token, after the caller has inspected case state. */
  forceReleaseOperation(caseId: string): void {
    this.db.prepare("DELETE FROM case_operations WHERE case_id = ?").run(caseId);
  }

  /** Explicit, scoped, time-boxed patient consent for an unattended action; never inferred from a payment. */
  grantAuthorization(caseId: string, scope: string, expiresAt: string): void {
    this.db.prepare("INSERT OR REPLACE INTO case_authorizations (case_id, scope, granted_at, expires_at) VALUES (?, ?, ?, ?)").run(caseId, scope, new Date().toISOString(), expiresAt);
  }

  /** Revokes a case's standing authorization; also used to consume a single-use grant after it is acted on. */
  revokeAuthorization(caseId: string): void {
    this.db.prepare("DELETE FROM case_authorizations WHERE case_id = ?").run(caseId);
  }

  /** Returns a live authorization, pruning it first if it has expired. */
  getAuthorization(caseId: string): { scope: string; grantedAt: string; expiresAt: string } | null {
    const row = this.db.prepare("SELECT scope, granted_at, expires_at FROM case_authorizations WHERE case_id = ?").get(caseId) as { scope: string; granted_at: string; expires_at: string } | undefined;
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) { this.revokeAuthorization(caseId); return null; }
    return { scope: row.scope, grantedAt: row.granted_at, expiresAt: row.expires_at };
  }

  /** Persist before acknowledging a provider delivery; stable message ID deduplicates retries. */
  enqueueStatement(entry: PhotonStatement): boolean {
    const result = this.db.prepare("INSERT OR IGNORE INTO statement_inbox (message_id, case_id, data, received_at) VALUES (?, ?, ?, ?)").run(entry.messageId, entry.caseId, JSON.stringify(entry), new Date().toISOString());
    return result.changes === 1;
  }

  pendingStatements(): PhotonStatement[] {
    return (this.db.prepare("SELECT data FROM statement_inbox WHERE status = 'PENDING' ORDER BY received_at LIMIT 25").all() as { data: string }[]).map((row) => JSON.parse(row.data));
  }

  /** Claims a patient command text by Spectrum message ID; false means it was already handled (redelivery). */
  claimCommand(messageId: string): boolean {
    return this.db.prepare("INSERT OR IGNORE INTO command_inbox (message_id, status, received_at) VALUES (?, 'PROCESSING', ?)").run(messageId, new Date().toISOString()).changes === 1;
  }

  finishCommand(messageId: string, status: string): void {
    this.db.prepare("UPDATE command_inbox SET status = ? WHERE message_id = ?").run(status, messageId);
  }

  /** Frees a claim whose work failed before any provider contact, so a redelivery can retry it. */
  releaseCommand(messageId: string): void {
    this.db.prepare("DELETE FROM command_inbox WHERE message_id = ? AND status = 'PROCESSING'").run(messageId);
  }

  beginText(key: string): boolean {
    return this.db.prepare("INSERT OR IGNORE INTO photon_outbox (operation_key, status, updated_at) VALUES (?, 'SENDING', ?)").run(key, new Date().toISOString()).changes === 1;
  }

  textStatus(key: string): { status: string; message_id: string | null } | null {
    return this.db.prepare("SELECT status, message_id FROM photon_outbox WHERE operation_key = ?").get(key) as { status: string; message_id: string | null } | undefined ?? null;
  }

  /** The SDK confirmed acceptance or the send attempt genuinely never reached it; either way the outcome is certain. */
  finishText(key: string, messageId?: string): void {
    this.db.prepare("UPDATE photon_outbox SET status = ?, message_id = ?, updated_at = ? WHERE operation_key = ?").run(messageId ? "ACCEPTED" : "UNCERTAIN", messageId ?? null, new Date().toISOString(), key);
  }

  /** A send attempt failed before reaching the provider (local validation); safe to retry without operator recovery. */
  failText(key: string): void {
    this.db.prepare("UPDATE photon_outbox SET status = 'FAILED', message_id = NULL, updated_at = ? WHERE operation_key = ?").run(new Date().toISOString(), key);
  }

  /** Reopens a FAILED record for one more send attempt; never touches an UNCERTAIN or ACCEPTED record. */
  retryText(key: string): boolean {
    return this.db.prepare("UPDATE photon_outbox SET status = 'SENDING', updated_at = ? WHERE operation_key = ? AND status = 'FAILED'").run(new Date().toISOString(), key).changes === 1;
  }

  /** Operator-only: resolves an UNCERTAIN outcome after inspecting Spectrum/iMessage directly. Never auto-resends. */
  recoverText(key: string, resolution: "DELIVERED" | "FAILED", messageId?: string): boolean {
    if (resolution === "DELIVERED") {
      return this.db.prepare("UPDATE photon_outbox SET status = 'ACCEPTED', message_id = COALESCE(?, message_id), updated_at = ? WHERE operation_key = ? AND status = 'UNCERTAIN'").run(messageId ?? null, new Date().toISOString(), key).changes === 1;
    }
    return this.db.prepare("UPDATE photon_outbox SET status = 'FAILED', message_id = NULL, updated_at = ? WHERE operation_key = ? AND status = 'UNCERTAIN'").run(new Date().toISOString(), key).changes === 1;
  }

  /** Case mutation and inbox completion commit together, including across process restarts. */
  applyStatement(messageId: string, transform: (current: MedicalBillCase | null) => MedicalBillCase): "applied" | "rejected" | "deferred" {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT case_id FROM statement_inbox WHERE message_id = ? AND status = 'PENDING'").get(messageId) as { case_id: string } | undefined;
      if (!row || this.db.prepare("SELECT 1 FROM case_operations WHERE case_id = ?").get(row.case_id)) {
        this.db.exec("COMMIT");
        return "deferred";
      }
      let next: MedicalBillCase;
      try { next = transform(this.get(row.case_id)); }
      catch {
        this.db.prepare("UPDATE statement_inbox SET status = 'REJECTED', error = 'Statement or case validation failed' WHERE message_id = ?").run(messageId);
        this.db.exec("COMMIT");
        return "rejected";
      }
      if (next.id !== row.case_id) throw new Error("Statement mutation changed case identity");
      this.save(next);
      this.db.prepare("UPDATE statement_inbox SET status = 'APPLIED' WHERE message_id = ?").run(messageId);
      this.db.exec("COMMIT");
      return "applied";
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  /** Closes the database connection. */
  close(): void { this.db.close(); }
}

let store: CaseStore | undefined;
/** Returns the process-wide local store used by route handlers. */
export function getStore(): CaseStore {
  store ??= new CaseStore(process.env.DATABASE_PATH || "./data/guardian.sqlite");
  return store;
}
