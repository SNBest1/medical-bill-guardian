import type { PhotonInboundFields } from "./photon-inbox";
import type { LocalPhotonMessage, LocalPhotonSpace } from "./photon-receiver";

export interface PatientCommand { messageId: string; text: string }
export const MAX_COMMAND_CHARS = 500;

/**
 * The single patient-command acceptance policy: inbound, DM, iMessage, plain text, short, and sent
 * by exactly the approved patient phone. Anything else returns null and is ignored silently, so
 * nothing is ever sent back to a stranger and the reason is never revealed.
 */
export function evaluatePatientCommand(fields: PhotonInboundFields, patientPhone: string): PatientCommand | null {
  if (fields.direction !== "inbound" || fields.spaceType !== "dm" || !/^imessage$/i.test(fields.messagePlatform ?? "") || !/^imessage$/i.test(fields.spacePlatform ?? "")) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(patientPhone) || fields.senderId !== patientPhone) return null;
  if (fields.contentType !== "text" || typeof fields.contentText !== "string") return null;
  const text = fields.contentText.trim();
  if (!text || text.length > MAX_COMMAND_CHARS) return null;
  if (!fields.messageId || fields.messageId.length > 256) return null;
  return { messageId: fields.messageId, text };
}

/** Adapts the SDK's in-process `[Space, Message]` shape to the shared patient policy. */
export function parseLocalPatientMessage(space: LocalPhotonSpace, message: LocalPhotonMessage, patientPhone: string): PatientCommand | null {
  if (!message || typeof message.id !== "string") return null;
  return evaluatePatientCommand({ messageId: message.id, direction: message.direction, messagePlatform: message.platform, spacePlatform: space?.__platform, spaceType: space?.type, senderId: message.sender?.id, contentType: message.content?.type, contentText: message.content?.text }, patientPhone);
}
