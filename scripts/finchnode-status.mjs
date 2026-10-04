import { loadEnvFile } from "node:process";
import { scenarios } from "../src/services/scenario-data.ts";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}

/**
 * Read-only: for each judge scenario, shows whether its consented FinchNode sandbox patient exists
 * (user ID and consent date) or is still pending, and which source tier the app would use right now:
 *   sandbox (authenticated, consented) > open demo API (keyless) > saved copy.
 * Prints no key or secret. Only GETs to FinchNode's /users, /users/{id}/records, and the keyless /demo/v1.
 *
 * Usage: node scripts/finchnode-status.mjs
 */
const key = process.env.FINCHNODE_API_KEY?.trim();
const base = (process.env.FINCHNODE_BASE_URL?.trim() || "https://api.finchnode.com/api/v1").replace(/\/$/, "");
const demo = "https://api.finchnode.com/demo/v1";
const get = (url, auth) => fetch(url, { headers: auth ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(10000) });

let users = [], listStatus = "no API key set";
if (key) {
  try {
    const response = await get(`${base}/users?limit=100`, true);
    listStatus = `GET /users -> HTTP ${response.status}`;
    if (response.ok) users = (await response.json()).data ?? [];
  } catch { listStatus = "GET /users failed (network)"; }
}
console.log(`Sandbox: ${listStatus}${key ? `; ${users.length} consented patient(s)` : ""}\n`);

for (const scenario of scenarios) {
  const label = scenario.finchSandboxLabel.toLowerCase();
  const match = users.filter((user) => (user.sources ?? []).some((source) => (source.organization ?? "").toLowerCase().split(" · ").some((part) => part.trim() === label)))
    .sort((a, b) => String(b.consentedAt).localeCompare(String(a.consentedAt)))[0];
  let sandbox = "";
  let usable = false;
  if (!key) sandbox = "no FINCHNODE_API_KEY";
  else if (!match) sandbox = `pending (no patient labeled "${scenario.finchSandboxLabel}" yet)`;
  else {
    try {
      const response = await get(`${base}/users/${encodeURIComponent(match.id)}/records`, true);
      if (!response.ok) sandbox = `exists (${match.id}, consented ${String(match.consentedAt).slice(0, 10)}) but records read gave HTTP ${response.status}`;
      else {
        const data = (await response.json()).data ?? {};
        const visit = (data.encounters ?? []).some((e) => String(e.startDate ?? e.date ?? "").startsWith(scenario.transaction.date));
        usable = visit;
        sandbox = `exists (${match.id}, consented ${String(match.consentedAt).slice(0, 10)}), ${visit ? `has the ${scenario.transaction.date} encounter` : `no encounter on ${scenario.transaction.date}`}`;
      }
    } catch { sandbox = `exists (${match.id}) but the records read failed (network)`; }
  }
  let demoUp = false;
  try { demoUp = (await get(`${demo}/users/${scenario.finchSubject}/records`, false)).ok; } catch {}
  const tier = usable ? "sandbox (authenticated, consented)" : demoUp ? "open demo API (keyless)" : "saved copy";
  console.log(`${scenario.id} (${scenario.patient.firstName} ${scenario.patient.lastName}, "${scenario.finchSandboxLabel}")\n  sandbox patient: ${sandbox}\n  open demo API:   ${demoUp ? "reachable" : "unreachable"}\n  tier the app would use: ${tier}\n`);
}
