import { loadEnvFile } from "node:process";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}

/**
 * Polls a FinchNode sandbox Connect session until its simulation either completes (and
 * exposes the subject to save as FINCHNODE_SUBJECT) or fails. Per FinchNode's docs, the
 * subject must be read from this session response — never from GET /users, which lists
 * admin-visible active shares and will not resolve a session that is still syncing.
 *
 * Usage: node scripts/finchnode-resolve-session.mjs [sessionId]
 * Defaults to FINCHNODE_CONNECT_SESSION from .env.local when no argument is given.
 */

const key = process.env.FINCHNODE_API_KEY;
if (!key) throw new Error("Configure FINCHNODE_API_KEY before resolving a session");
const base = (process.env.FINCHNODE_BASE_URL || "https://api.finchnode.com/api/v1").replace(/\/$/, "");
const sessionId = process.argv[2] || process.env.FINCHNODE_CONNECT_SESSION;
if (!sessionId) throw new Error("Pass a session ID or set FINCHNODE_CONNECT_SESSION");

const maxAttempts = Number(process.env.FINCHNODE_RESOLVE_ATTEMPTS || 12);
const intervalMs = Number(process.env.FINCHNODE_RESOLVE_INTERVAL_MS || 10000);
let lastState = "unknown";

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const response = await fetch(`${base}/connect/sessions/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`FinchNode session lookup failed: ${response.status}`);
  const session = await response.json();
  lastState = session.simulation?.state ?? "unknown";
  console.log(`[${attempt}/${maxAttempts}] status=${session.status} simulation=${lastState} sync=${session.sync?.status} subject=${session.subject ?? "(none yet)"}`);
  if (lastState === "completed" && session.subject) {
    console.log(`\nResolved. Set this in .env.local:\nFINCHNODE_SUBJECT=${session.subject}`);
    process.exit(0);
  }
  if (lastState === "failed") {
    console.error("\nSimulation failed. Create a new Connect session and simulate call instead of retrying this one.");
    process.exit(1);
  }
  if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.error(`\nStill "${lastState}" after ${maxAttempts} attempts. This matches a known sandbox limitation — see docs/FINCHNODE_HANDOFF.md. Re-run this script later, or start a fresh session and try again.`);
process.exit(1);
