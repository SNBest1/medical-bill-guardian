import { loadEnvFile } from "node:process";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}

const base = process.env.GUARDIAN_LOCAL_URL || "http://127.0.0.1:3000";
const url = new URL(base);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Local worker requires a loopback app URL");
const token = process.env.GUARDIAN_WORKER_TOKEN;
if (!token || token.length < 32) throw new Error("Configure GUARDIAN_WORKER_TOKEN (at least 32 characters)");
let running = true;
process.on("SIGINT", () => { running = false; });
process.on("SIGTERM", () => { running = false; });
console.log("Guardian worker: polling synthetic discovery and signed statement inbox every 15 seconds");
while (running) {
  try {
    const response = await fetch(new URL("/api/integrations/tick", url), { method: "POST", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    const body = await response.json().catch(() => ({}));
    console.log(JSON.stringify({ status: response.status, detected: body.detected, inbox: body.inbox }));
  } catch { console.error("Worker tick failed; retrying without dropping queued statements"); }
  if (running) await new Promise((resolve) => setTimeout(resolve, 15000));
}
