import { callReducer, inboundKind, pendingEmails } from "./db";
import { parseProviderReply } from "./mime";
import { sendProviderEmail } from "./resend";
import type { Env, InboundMessage } from "./types";
import { handleSandboxDiscover } from "./sandbox";

/** Handles static assets and the authenticated sandbox discovery route. */
async function handleFetch(request: Request, env: Env): Promise<Response> {
  if (new URL(request.url).pathname === "/api/sandbox/discover" && request.method === "POST") return handleSandboxDiscover(request, env);
  return env.ASSETS.fetch(request);
}

/** Ingests only correlated, sent-request replies from the configured test provider. */
async function handleEmail(message: InboundMessage, env: Env): Promise<void> {
  if (message.to.toLowerCase() !== "ai@nipunsaini.com") return;
  if (message.from.toLowerCase() !== (env.PROVIDER_REPLY_EMAIL ?? "nipun.saini9@gmail.com").toLowerCase()) return;
  const parsed = await parseProviderReply(message);
  if (!parsed) return;
  const kind = await inboundKind(env, parsed.caseId);
  if (kind === "bill" && parsed.statement) await callReducer(env, "ingest_provider_bill_email", [parsed.caseId, parsed.messageId, parsed.statement]);
  if (kind === "review" && parsed.body) await callReducer(env, "ingest_provider_review_email", [parsed.caseId, parsed.messageId, parsed.body]);
}

/** Polls authorized outbox rows; sending stays disabled until deployment secrets and flag are set. */
async function dispatchPending(env: Env): Promise<void> {
  if (env.EMAIL_SEND_ENABLED !== "true") return;
  for (const item of await pendingEmails(env)) {
    const messageId = await sendProviderEmail(env, item);
    await callReducer(env, "record_outbound_email", [item.caseId, item.kind, messageId]);
  }
}

export default {
  fetch: handleFetch,
  email: handleEmail,
  scheduled: (_event: unknown, env: Env) => dispatchPending(env),
};
