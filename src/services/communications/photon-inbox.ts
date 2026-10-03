import { createHmac, timingSafeEqual } from "node:crypto";
import type { CaseStore } from "../../lib/db";
import { receiveItemizedStatement } from "../agent/orchestrator";

export interface PhotonStatement { messageId: string; sender: string; caseId: string; statement: string }

/** Stable Spectrum native signature contract. Never reserialize before verification. */
export function verifyPhotonSignature(raw: Buffer, headers: Headers, secret: string, now = Date.now()): boolean {
  const timestamp = headers.get("x-spectrum-timestamp") ?? "";
  const signature = headers.get("x-spectrum-signature") ?? "";
  if (!secret || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^v0=[0-9a-f]{64}$/.test(signature)) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:`).update(raw).digest("hex")}`;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

interface InboundFields {
  messageId: string;
  direction?: string;
  messagePlatform?: string;
  spacePlatform?: string;
  spaceType?: string;
  senderId?: string;
  contentType?: string;
  contentText?: string;
}

/**
 * Security-critical statement-acceptance policy, shared by every inbound transport (the signed
 * public webhook and the local SDK receiver alike): hospital sender only, DM only, iMessage only,
 * plain text only, and the exact case-addressed grammar. Changing this in one place keeps both
 * transports' trust boundary identical.
 */
function evaluateInbound(fields: InboundFields, hospitalPhone: string): PhotonStatement | null {
  if (fields.direction !== "inbound" || fields.spaceType !== "dm" || !/^imessage$/i.test(fields.messagePlatform ?? "") || !/^imessage$/i.test(fields.spacePlatform ?? "")) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(hospitalPhone) || fields.senderId !== hospitalPhone) return null;
  if (fields.contentType !== "text" || typeof fields.contentText !== "string") return null;
  const text = fields.contentText;
  if (Buffer.byteLength(text) > 65536) throw new Error("Statement too large");
  const match = /^Case: (CASE-[A-Z0-9-]+)\r?\nSynthetic demo statement\r?\n([\s\S]+)$/.exec(text);
  if (!match) return null;
  return { messageId: fields.messageId, sender: hospitalPhone, caseId: match[1], statement: match[2] };
}

/** Only the approved hospital's synthetic, explicitly case-addressed text is accepted. */
export function parsePhotonStatement(payload: unknown, hospitalPhone: string): PhotonStatement | null {
  if (!payload || typeof payload !== "object") throw new Error("Invalid webhook payload");
  const value = payload as { event?: string; space?: { platform?: string; type?: string }; message?: { id?: string; platform?: string; direction?: string; sender?: { id?: string }; content?: { type?: string; text?: string } } };
  if (value.event !== "messages") return null;
  const message = value.message;
  if (!message || typeof message.id !== "string" || !message.id || message.id.length > 256) throw new Error("Missing message ID");
  return evaluateInbound({ messageId: message.id, direction: message.direction, messagePlatform: message.platform, spacePlatform: value.space?.platform, spaceType: value.space?.type, senderId: message.sender?.id, contentType: message.content?.type, contentText: message.content?.text }, hospitalPhone);
}

/** Shared with the local SDK receiver so both inbound transports enforce the identical policy. */
export { evaluateInbound as evaluateInboundPhotonMessage, type InboundFields as PhotonInboundFields };

/** Drains stored messages transactionally; a busy case remains queued for the next worker tick. */
export function processPhotonInbox(store: CaseStore): { applied: number; rejected: number; deferred: number } {
  const result = { applied: 0, rejected: 0, deferred: 0 };
  for (const entry of store.pendingStatements()) {
    const status = store.applyStatement(entry.messageId, (current) => {
      if (!current) throw new Error("Unknown case");
      // The public receiver is a demo integration, never an intake for real patient records.
      if (current.transaction.id !== "nessie-demo-4820") throw new Error("Only the seeded synthetic case accepts Photon statements");
      const next = receiveItemizedStatement(current, entry.statement);
      const timestamp = new Date().toISOString();
      next.auditLog.push({ id: crypto.randomUUID(), timestamp, action: "PHOTON_STATEMENT", tool: "signedPhotonInbox", inputSummary: entry.messageId, outputSummary: "Approved demo sender; case and provider validated", status: "SUCCESS" });
      next.timeline.push({ id: crypto.randomUUID(), timestamp, title: "Hospital text received", detail: "A signed synthetic statement was matched to this case", source: "Photon", status: "complete" });
      return next;
    });
    result[status]++;
  }
  return result;
}
