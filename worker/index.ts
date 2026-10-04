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
  // One reason line per early return; never logs message content.
  if (message.to.toLowerCase() !== "ai@nipunsaini.com") { console.log("email ignored: wrong recipient"); return; }
  if (message.from.toLowerCase() !== (env.PROVIDER_REPLY_EMAIL ?? "nipun.saini9@gmail.com").toLowerCase()) { console.log("email ignored: sender is not the configured provider"); return; }
  const sender = verifiedSender(message.headers, message.from);
  if (!sender.ok) { console.warn(`ignored provider email: ${sender.reason}`); return; }
  const parsed = await parseProviderReply(message, { allowedHosts: allowedPdfHosts(env.BILL_PDF_ALLOWED_HOSTS) });
  if (!parsed) { console.log("email ignored: no single [CASE-n] subject marker or no Message-ID"); return; }
  const kind = await inboundKind(env, parsed.caseId);
  console.log(`email for case ${parsed.caseId}: expecting ${kind ?? "nothing"}; statement ${parsed.statement ? "parsed" : "not found"}`);
  if (kind === "bill" && parsed.statement) await callReducer(env, "ingest_provider_bill_email", [Number(parsed.caseId), parsed.messageId, parsed.statement]);
  if (kind === "review" && parsed.body) await callReducer(env, "ingest_provider_review_email", [Number(parsed.caseId), parsed.messageId, parsed.body]);
}

export default {
  fetch: handleFetch,
  email: handleEmail,
  scheduled: async (_event: unknown, env: Env) => { await dispatchPending(env); },
};
