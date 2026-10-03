import { loadEnvFile } from "node:process";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}

// Alternative to registering a public webhook: holds a live Spectrum connection and forwards
// each inbound hospital DM to the local app's durable statement inbox over loopback. Never sends
// anything — it is a receiver only. Requires the operator's own explicit rehearsal authorization
// before running against real Spectrum Cloud credentials.

const base = process.env.GUARDIAN_LOCAL_URL || "http://127.0.0.1:3000";
const url = new URL(base);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Local receiver requires a loopback app URL");
const token = process.env.GUARDIAN_WORKER_TOKEN;
if (!token || token.length < 32) throw new Error("Configure GUARDIAN_WORKER_TOKEN (at least 32 characters)");
if (process.env.DEMO_MODE === "false") throw new Error("Refusing to run outside DEMO_MODE");
const projectId = process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
if (!projectId || !projectSecret) throw new Error("Configure SPECTRUM_PROJECT_ID / SPECTRUM_PROJECT_SECRET");
if (!process.env.DEMO_HOSPITAL_PHONE) throw new Error("Configure DEMO_HOSPITAL_PHONE");

console.log("Guardian Photon receiver: holding a live Spectrum connection as a webhook alternative. Receive-only; nothing is ever sent from this process.");

const { Spectrum } = await import("spectrum-ts");
const { imessage } = await import("spectrum-ts/providers/imessage");
const app = await Spectrum({ projectId, projectSecret, telemetry: false, options: { logLevel: "error" }, providers: [imessage.config()] });

let running = true;
process.on("SIGINT", () => { running = false; void app.stop(); });
process.on("SIGTERM", () => { running = false; void app.stop(); });

for await (const [space, message] of app.messages) {
  if (!running) break;
  const forwarded = {
    space: { __platform: space.__platform, type: space.type },
    message: { id: message.id, direction: message.direction, platform: message.platform, sender: message.sender ? { id: message.sender.id } : undefined, content: message.content },
  };
  try {
    const response = await fetch(new URL("/api/integrations/photon/local-intake", url), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(forwarded),
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json().catch(() => ({}));
    console.log(JSON.stringify({ status: response.status, ...body }));
  } catch (error) {
    console.error("Forward to local inbox failed; message stays unread in Spectrum and will be redelivered", error);
  }
}
