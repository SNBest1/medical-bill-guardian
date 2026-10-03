import { evaluateInboundPhotonMessage, type PhotonStatement } from "./photon-inbox";

export interface LocalPhotonSpace { __platform?: string; type?: string }
export interface LocalPhotonMessage { id: string; direction?: string; platform?: string; sender?: { id?: string }; content?: { type?: string; text?: string } }

/**
 * Validates one message the way the SDK's own live connection delivers it (an in-process
 * `[Space, Message]` pair from `app.messages`), not the webhook's wire-format envelope. Enforces
 * the identical policy as `parsePhotonStatement` via the shared `evaluateInboundPhotonMessage` —
 * this is the alternative transport for receiving the hospital's statement without exposing a
 * public webhook URL, so it must not be allowed to drift to a looser trust boundary.
 */
export function parseLocalPhotonMessage(space: LocalPhotonSpace, message: LocalPhotonMessage, hospitalPhone: string): PhotonStatement | null {
  if (!message || typeof message.id !== "string" || !message.id || message.id.length > 256) throw new Error("Missing message ID");
  return evaluateInboundPhotonMessage({ messageId: message.id, direction: message.direction, messagePlatform: message.platform, spacePlatform: space?.__platform, spaceType: space?.type, senderId: message.sender?.id, contentType: message.content?.type, contentText: message.content?.text }, hospitalPhone);
}
