import { callReducer, inboundKind } from "./db";
import { dispatchPending } from "./dispatch";
import { verifiedSender } from "./sender";
import { parseProviderReply } from "./mime";
import { allowedPdfHosts } from "./pdf-link";
import type { Env, InboundMessage } from "./types";
import { handleSandboxDiscover } from "./sandbox";

/** Handles static assets and the authenticated sandbox discovery route. */
async function handleFetch(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/api/sandbox/discover" && request.method === "POST") return handleSandboxDiscover(request, env);
  if (path.startsWith("/api/")) return new Response("Not found", { status: 404 });
  return env.ASSETS.fetch(request);
}

/** Ingests only correlated, sent-request replies from the configured test provider. */
async function handleEmail(message: InboundMessage, env: Env): Promise<void> {
  if (message.to.toLowerCase() !== "ai@nipunsaini.com") return;
  if (message.from.toLowerCase() !== (env.PROVIDER_REPLY_EMAIL ?? "nipun.saini9@gmail.com").toLowerCase()) return;
  const sender = verifiedSender(message.headers, message.from);
  if (!sender.ok) { console.warn(`ignored provider email: ${sender.reason}`); return; }
  const parsed = await parseProviderReply(message, { allowedHosts: allowedPdfHosts(env.BILL_PDF_ALLOWED_HOSTS) });
  if (!parsed) return;
  const kind = await inboundKind(env, parsed.caseId);
  if (kind === "bill" && parsed.statement) await callReducer(env, "ingest_provider_bill_email", [parsed.caseId, parsed.messageId, parsed.statement]);
  if (kind === "review" && parsed.body) await callReducer(env, "ingest_provider_review_email", [parsed.caseId, parsed.messageId, parsed.body]);
}

export default {
  fetch: handleFetch,
  email: handleEmail,
  scheduled: async (_event: unknown, env: Env) => { await dispatchPending(env); },
};
