import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { MedicalBillCase } from "../types/domain";

export class CaseStore {
  private db: DatabaseSync;

  /** Opens the local case database and creates its schema if needed. */
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, updated_at TEXT NOT NULL)");
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
    this.db.prepare("INSERT INTO cases (id, transaction_id, data, updated_at) VALUES (?, ?, ?, ?)").run(caseData.id, caseData.transaction.id, JSON.stringify(caseData), caseData.updatedAt);
    return caseData;
  }

  /** Persists the latest case state. */
  save(caseData: MedicalBillCase): void {
    this.db.prepare("UPDATE cases SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(caseData), caseData.updatedAt, caseData.id);
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
