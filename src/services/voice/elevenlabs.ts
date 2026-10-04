export interface OutboundCallRequest {
  toNumber: string;
  dialAuthorized: boolean;
}

export interface OutboundCallResult {
  conversationId: string | null;
  callSid: string | null;
}

interface ElevenLabsConfig {
  apiKey: string;
  agentId: string;
  agentPhoneNumberId: string;
}

export function elevenLabsConfig(env: Record<string, string | undefined> = process.env): ElevenLabsConfig {
  const apiKey = env.ELEVENLABS_API_KEY ?? "";
  const agentId = env.ELEVENLABS_AGENT_ID ?? "";
  const agentPhoneNumberId = env.ELEVENLABS_AGENT_PHONE_NUMBER_ID ?? "";
  if (!apiKey || !agentId || !agentPhoneNumberId) throw new Error("ElevenLabs voice is not configured");
  return { apiKey, agentId, agentPhoneNumberId };
}

/** Places a call through the ElevenLabs agent. Refuses unless the caller explicitly authorizes the dial. */
export async function placeOutboundCall(
  request: OutboundCallRequest,
  config: ElevenLabsConfig = elevenLabsConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<OutboundCallResult> {
  if (request.dialAuthorized !== true) throw new Error("Outbound dialing requires explicit rehearsal authorization");
  const response = await fetchImpl("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": config.apiKey },
    body: JSON.stringify({
      agent_id: config.agentId,
      agent_phone_number_id: config.agentPhoneNumberId,
      to_number: request.toNumber,
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs outbound call failed with status ${response.status}`);
  const body = (await response.json()) as { conversation_id?: string | null; callSid?: string | null };
  return { conversationId: body.conversation_id ?? null, callSid: body.callSid ?? null };
}
