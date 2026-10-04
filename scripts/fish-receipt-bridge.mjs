import { createServer } from "node:http";
import { loadEnvFile } from "node:process";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}
const app = new URL(process.env.GUARDIAN_LOCAL_URL || "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(app.hostname)) throw new Error("Receipt bridge requires loopback app");
// This is the only publicly reachable operation. No UI, general API, or case data is exposed.
createServer(async (req, res) => {
  if (req.url !== "/bill-receipt" || req.method !== "POST") { res.writeHead(404).end(); return; }
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 2048) { res.writeHead(413).end(); return; } chunks.push(chunk); }
  try {
    const response = await fetch(new URL("/api/integrations/fish/bill-receipt", app), { method: "POST", headers: { authorization: req.headers.authorization || "", "content-type": "application/json" }, body: Buffer.concat(chunks), signal: AbortSignal.timeout(10000) });
    res.writeHead(response.status, { "content-type": "application/json", "cache-control": "no-store" }).end(await response.text());
  } catch { res.writeHead(503).end('{"status":"unavailable","message":"Receipt check unavailable; do not confirm receipt."}'); }
}).listen(3211, "127.0.0.1", () => console.log("Fish receipt bridge listening on loopback port 3211"));
