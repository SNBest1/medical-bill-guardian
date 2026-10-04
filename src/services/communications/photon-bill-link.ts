import type { PhotonInboundFields } from "./photon-inbox";
import type { LocalPhotonMessage, LocalPhotonSpace } from "./photon-receiver";

export interface HospitalBillLink { messageId: string; url: string }
export const MAX_BILL_LINK_TEXT_CHARS = 2000;
const LOCAL_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The single hospital bill-link acceptance policy, mirroring evaluatePatientCommand: inbound iMessage
 * DM, plain text, short, from exactly the approved hospital phone, containing an https URL whose path
 * ends in .pdf (plain http only for a loopback host, which the fetcher still refuses outside tests).
 * Only the first URL is considered. This says nothing about whether the host is trusted; safe-fetch decides that.
 */
export function evaluateHospitalBillLink(fields: PhotonInboundFields, hospitalPhone: string): HospitalBillLink | null {
  if (fields.direction !== "inbound" || fields.spaceType !== "dm" || !/^imessage$/i.test(fields.messagePlatform ?? "") || !/^imessage$/i.test(fields.spacePlatform ?? "")) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(hospitalPhone) || fields.senderId !== hospitalPhone) return null;
  if (fields.contentType !== "text" || typeof fields.contentText !== "string") return null;
  if (!fields.messageId || fields.messageId.length > 256) return null;
  const text = fields.contentText;
  if (!text.trim() || text.length > MAX_BILL_LINK_TEXT_CHARS) return null;
  const candidate = /https?:\/\/[^\s<>"]+/i.exec(text)?.[0].replace(/[.,;:!?)\]]+$/, "");
  if (!candidate) return null;
  let url: URL;
  try { url = new URL(candidate); } catch { return null; }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_NAMES.has(url.hostname))) return null;
  if (!url.pathname.toLowerCase().endsWith(".pdf")) return null;
  return { messageId: fields.messageId, url: url.toString() };
}

/** Adapts the SDK's in-process `[Space, Message]` shape to the shared hospital bill-link policy. */
export function parseLocalBillLinkMessage(space: LocalPhotonSpace, message: LocalPhotonMessage, hospitalPhone: string): HospitalBillLink | null {
  if (!message || typeof message.id !== "string") return null;
  return evaluateHospitalBillLink({ messageId: message.id, direction: message.direction, messagePlatform: message.platform, spacePlatform: space?.__platform, spaceType: space?.type, senderId: message.sender?.id, contentType: message.content?.type, contentText: message.content?.text }, hospitalPhone);
}
