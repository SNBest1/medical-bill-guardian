import { loadEnvFile } from "node:process";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}

/**
 * Starts a fresh FinchNode sandbox Connect session and simulates it with a synthetic
 * patient, per https://finchnode.com/docs/get-started/quickstart. Prints the session ID
 * to resolve with scripts/finchnode-resolve-session.mjs.
 *
 * Usage: node scripts/finchnode-start-session.mjs [scenario]
 * Defaults to the "baseline-adult" scenario.
 */

const key = process.env.FINCHNODE_API_KEY;
if (!key) throw new Error("Configure FINCHNODE_API_KEY before starting a session");
const base = (process.env.FINCHNODE_BASE_URL || "https://api.finchnode.com/api/v1").replace(/\/$/, "");
const scenario = process.argv[2] || "baseline-adult";

const created = await fetch(`${base}/connect/sessions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ externalId: `medical-bill-guardian-${Date.now()}`, categories: ["encounters", "medications", "labs", "documents"] })
});
if (!created.ok) throw new Error(`FinchNode session creation failed: ${created.status}`);
const session = await created.json();
console.log(`Created session ${session.id}`);

const simulated = await fetch(`${base}/connect/sessions/${session.id}/simulate`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ scenario })
});
if (!simulated.ok) throw new Error(`FinchNode simulate failed: ${simulated.status}`);
console.log(`Simulating scenario "${scenario}". Resolve it with:\nFINCHNODE_CONNECT_SESSION=${session.id} node scripts/finchnode-resolve-session.mjs`);
