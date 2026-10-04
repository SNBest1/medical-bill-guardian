import type { PhotonInboundFields } from "./photon-inbox";
import type { LocalPhotonMessage, LocalPhotonSpace } from "./photon-receiver";

export interface PatientCommand { messageId: string; text: string; unsupported?: "too-long" | "unreadable" }
export const MAX_COMMAND_CHARS = 500;

/**
 * Accept only inbound iMessage DMs from the approved patient. Unreadable and oversized
 * messages receive guidance without becoming commands; other senders are ignored.
 */
export function evaluatePatientCommand(fields: PhotonInboundFields, patientPhone: string): PatientCommand | null {
  if (fields.direction !== "inbound" || fields.spaceType !== "dm" || !/^imessage$/i.test(fields.messagePlatform ?? "") || !/^imessage$/i.test(fields.spacePlatform ?? "")) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(patientPhone) || fields.senderId !== patientPhone) return null;
  if (!fields.messageId || fields.messageId.length > 256) return null;
  if (fields.contentType !== "text" || typeof fields.contentText !== "string" || !fields.contentText.trim()) return { messageId: fields.messageId, text: "", unsupported: "unreadable" };
  const text = fields.contentText.trim();
  if (text.length > MAX_COMMAND_CHARS) return { messageId: fields.messageId, text: "", unsupported: "too-long" };
  return { messageId: fields.messageId, text };
}

/** Adapts the SDK's in-process `[Space, Message]` shape to the shared patient policy. */
export function parseLocalPatientMessage(space: LocalPhotonSpace, message: LocalPhotonMessage, patientPhone: string): PatientCommand | null {
  if (!message || typeof message.id !== "string") return null;
  return evaluatePatientCommand({ messageId: message.id, direction: message.direction, messagePlatform: message.platform, spacePlatform: space?.__platform, spaceType: space?.type, senderId: message.sender?.id, contentType: message.content?.type, contentText: message.content?.text }, patientPhone);
}
