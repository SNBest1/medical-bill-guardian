import { createHash } from "node:crypto";
import { validateResearchRequest, type PriceResearchRequest, type PriceResearchResult } from "./price-research";

/** Transport-neutral Relay command: no patient names, IDs, records, or arbitrary URLs. */
export function parseRelayResearchCommand(text: string): PriceResearchRequest {
  if (!text.startsWith("RESEARCH_PRICE\n") || text.length > 16384) throw new Error("Expected RESEARCH_PRICE followed by pricing-context JSON");
  return validateResearchRequest(JSON.parse(text.slice("RESEARCH_PRICE\n".length)));
}

export function relayResearchReply(result: PriceResearchResult) {
  return { message: { parts: [{ type: "text" as const, value: `PRICE_RESEARCH_RESULT\n${JSON.stringify(result)}` }] } };
}

/** Optional egress only to explicitly approved research chats. Not a webhook/authentication receiver. */
export async function sendRelayResearchReply(result: PriceResearchResult, options: { token: string; apiUrl: string; chatId: string; approvedChatIds: string[] }, fetcher: typeof fetch = fetch) {
  if (!options.token || !options.approvedChatIds.includes(options.chatId)) throw new Error("Relay research reply needs a token and an explicitly approved chat");
  if (!/^https:\/\/api(?:\.staging)?\.relayapp\.im\/?$/.test(options.apiUrl)) throw new Error("Use the verified Relay issuing environment");
  const body = JSON.stringify(relayResearchReply(result));
  const key = "price-research-" + createHash("sha256").update(result.requestId + "\n" + body).digest("hex");
  const response = await fetcher(`${options.apiUrl.replace(/\/$/, "")}/v1/chats/${encodeURIComponent(options.chatId)}/messages`, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json", "Idempotency-Key": key }, body, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Relay research reply failed (${response.status})`);
  return response.json();
}
