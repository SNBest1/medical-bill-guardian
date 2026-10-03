import type { CaseStore } from "../../lib/db";
import type { MedicalBillCase } from "../../types/domain";

export class CaseBusyError extends Error {}

/** All async case mutations reread state after obtaining the same persisted guard.
 * retainOnFailure may be a predicate so only ambiguous failures (e.g. a provider contact
 * that may or may not have been received) require manual recovery; a plain read failure
 * should release the guard so the caller can safely retry on its own. */
export async function mutateCase(store: CaseStore, id: string, action: (current: MedicalBillCase) => Promise<MedicalBillCase> | MedicalBillCase, retainOnFailure: boolean | ((error: unknown) => boolean) = false): Promise<MedicalBillCase> {
  const token = store.acquireOperation(id);
  if (!token) throw new CaseBusyError("A case operation is active or awaiting recovery");
  try {
    const current = store.get(id);
    if (!current) throw new Error("Case not found");
    const next = await action(current);
    if (next.id !== id || next.transaction.id !== current.transaction.id) throw new Error("Case identity changed");
    store.save(next);
    store.releaseOperation(id, token);
    return next;
  } catch (error) {
    const retain = typeof retainOnFailure === "function" ? retainOnFailure(error) : retainOnFailure;
    if (!retain) store.releaseOperation(id, token);
    throw error;
  }
}
