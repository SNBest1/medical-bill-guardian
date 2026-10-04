import { callReducer, pendingEmails, sentInLast24h, type PendingEmail } from "./db";
import { sendProviderEmail } from "./resend";
import type { Env } from "./types";

export interface DispatchDeps {
  pendingEmails: (env: Env) => Promise<PendingEmail[]>;
  sentInLast24h: (env: Env) => Promise<number>;
  send: (env: Env, item: PendingEmail) => Promise<string>;
  callReducer: (env: Env, reducer: string, args: unknown[]) => Promise<void>;
}

const defaults: DispatchDeps = { pendingEmails, sentInLast24h, send: sendProviderEmail, callReducer };

/**
 * Sends authorized outbox rows. Each failure is recorded durably (record_outbound_failure dead-letters
 * after 3) and never blocks the rest. Every visitor can authorize a demo email that lands in the one
 * test inbox, so a rolling 24-hour cap (EMAIL_DAILY_LIMIT, default 20) bounds abuse.
 */
export async function dispatchPending(env: Env, deps: DispatchDeps = defaults): Promise<{ sent: number; failed: number; capped: number }> {
  const result = { sent: 0, failed: 0, capped: 0 };
  if (env.EMAIL_SEND_ENABLED !== "true") return result;
  const items = await deps.pendingEmails(env);
  if (!items.length) return result;
  const limit = Number(env.EMAIL_DAILY_LIMIT ?? 20);
  let sentToday = await deps.sentInLast24h(env);
  for (const item of items) {
    if (sentToday >= limit) { result.capped++; continue; }
    let messageId: string;
    try { messageId = await deps.send(env, item); }
    catch (error) {
      result.failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`email send failed for communication ${item.communicationId}: ${message}`);
      await deps.callReducer(env, "record_outbound_failure", [Number(item.communicationId), message]).catch((cause) => console.error(`could not record failure: ${cause}`));
      continue;
    }
    // u64 reducer arguments must be JSON numbers; a numeric string is rejected with 400.
    // If recording fails, the next run resends with the same Idempotency-Key and Resend replays this message.
    try { await deps.callReducer(env, "record_outbound_email", [Number(item.caseId), item.kind, messageId]); }
    catch (error) { console.error(`sent ${messageId} but could not record it: ${error instanceof Error ? error.message : String(error)}`); }
    result.sent++;
    sentToday++;
  }
  if (result.capped) console.warn(`email daily limit ${limit} reached; ${result.capped} left pending`);
  return result;
}
