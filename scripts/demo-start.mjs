import { loadEnvFile } from "node:process";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}
const checking = process.argv.includes("--check");
const dryRun = process.argv.includes("--dry-run");
const base = process.env.GUARDIAN_LOCAL_URL || "http://127.0.0.1:3000";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Demo startup requires the local app");
const required = ["GUARDIAN_WORKER_TOKEN", "SPECTRUM_PROJECT_ID", "SPECTRUM_PROJECT_SECRET", "DEMO_PATIENT_PHONE", "DEMO_HOSPITAL_PHONE", "FISH_API_KEY", "FISH_AGENT_ID", "FISH_REVIEW_AGENT_ID", "FISH_RECEIPT_TOKEN"];
if (process.env.DEMO_MODE === "false") throw new Error("Demo startup requires demo mode");
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
if (process.env.GUARDIAN_WORKER_TOKEN.length < 32 || process.env.FISH_RECEIPT_TOKEN.length < 32) throw new Error("Worker and receipt tokens must have at least 32 characters");
if (["PHOTON_REPLY_TEXTS", "PHOTON_DEMO_TEXTS", "PHOTON_UPDATE_TEXTS"].some((key) => process.env[key] !== "true")) throw new Error("Enable PHOTON_REPLY_TEXTS, PHOTON_DEMO_TEXTS and PHOTON_UPDATE_TEXTS for the patient text demo");
if (!existsSync("data/fish-receipt-tool.json")) throw new Error("Initial receipt tool setup is missing; see docs/DEMO_STARTUP.md");
if (dryRun) {
 console.log("Plan: start/reuse local app, text receiver, worker and receipt bridge; start a tunnel if needed; refresh Fish receipt URL; verify receipt endpoint and both published agents. No services started or external changes made.");
 process.exit(0);
}
mkdirSync("data/demo-logs", { recursive: true });
const owned = new Set();
let stopping = false;
function stop(code = 0) {
 if (stopping) return; stopping = true;
 for (const child of owned) child.kill("SIGTERM");
 console.log("Stopped services started by this command. Reused services were left running.");
 setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stop()); process.on("SIGTERM", () => stop());
function running(needle) {
 const lines = execFileSync("ps", ["-ax", "-o", "pid=,command="], { encoding: "utf8" }).split("\n");
 return lines.some((line) => {
  const match = /^\s*(\d+)\s+(.*)$/.exec(line);
  if (!match || Number(match[1]) === process.pid || !match[2].includes(needle) || !/^(?:\S*\/)?node\s/.test(match[2])) return false;
  try { return execFileSync("lsof", ["-a", "-p", match[1], "-d", "cwd", "-Fn"], { encoding: "utf8" }).split("\n").includes(`n${process.cwd()}`); } catch { return false; }
 });
}
function start(name, command, args) {
 const log = resolve(`data/demo-logs/${name}.log`);
 const fd = openSync(log, "a");
 const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ["ignore", fd, fd] });
 owned.add(child);
 child.once("error", () => { console.error(`${name} failed to start. See ${log}`); stop(1); });
 child.once("exit", (code) => { owned.delete(child); if (!stopping) { console.error(`${name} stopped (${code}). See ${log}`); stop(1); } });
 console.log(`Started ${name}; log: ${log}`);
 return child;
}
async function get(url, init = {}) {
 const r = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
 if (!r.ok) throw new Error(`Endpoint returned ${r.status}`);
 return r;
}
async function reachable(url) { try { await get(url); return true; } catch { return false; } }
async function waitFor(check, label, timeout = 60000) {
 const deadline = Date.now() + timeout;
 while (Date.now() < deadline) {
  if (stopping) throw new Error("Startup stopped");
  if (await check()) return;
  await new Promise((done) => setTimeout(done, 700));
 }
 throw new Error(`${label} did not become ready; see data/demo-logs`);
}
async function receipt(url) {
 const active = await (await get(new URL("/api/active-case", base))).json();
 const result = await (await get(url, { method: "POST", headers: { authorization: `Bearer ${process.env.FISH_RECEIPT_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ case_id: active?.id ?? "startup-check", attempt_id: active?.auditLog?.[0]?.id ?? "startup-check" }) })).json();
 if (!["received", "processing", "waiting", "failed", "unavailable"].includes(result.status)) throw new Error("Invalid receipt response");
 return result.status;
}
async function publicReady() {
 if (!process.env.FISH_RECEIPT_URL) return false;
 try { await receipt(process.env.FISH_RECEIPT_URL); return true; } catch { return false; }
}
async function fish(path) {
 return (await get(`https://api.fish.audio/v1/agent/${path}`, { headers: { authorization: `Bearer ${process.env.FISH_API_KEY}` } })).json();
}
try {
 if (!await reachable(base)) {
  if (checking) throw new Error("App is offline");
  start("app", process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", new URL(base).port || "3000"]);
  await waitFor(() => reachable(base), "App");
 } else console.log("App is reachable; reused it.");
 for (const [name, script] of [["receiver", "photon-receiver.mjs"], ["worker", "integration-worker.mjs"], ["receipt-bridge", "fish-receipt-bridge.mjs"]]) {
  if (running(`scripts/${script}`)) console.log(`${name} already running; reused it.`);
  else if (checking) throw new Error(`${name} is not running`);
  else start(name, process.execPath, [`scripts/${script}`]);
 }
 await waitFor(async () => { try { await receipt("http://127.0.0.1:3211/bill-receipt"); return true; } catch { return false; } }, "Receipt bridge", checking ? 10000 : 60000);
 if (!await publicReady()) {
  if (checking) throw new Error("Public receipt tunnel is offline");
  let binary = process.env.CLOUDFLARED_PATH;
  if (!binary && existsSync("data/tools/cloudflared")) binary = resolve("data/tools/cloudflared");
  if (!binary) { try { binary = execFileSync("which", ["cloudflared"], { encoding: "utf8" }).trim(); } catch {} }
  if (!binary) throw new Error("cloudflared is missing; install the official CLI or set CLOUDFLARED_PATH (see startup checklist)");
  writeFileSync("data/demo-logs/tunnel.log", "");
  start("tunnel", binary, ["tunnel", "--url", "http://127.0.0.1:3211", "--no-autoupdate"]);
  await waitFor(async () => {
   const text = readFileSync("data/demo-logs/tunnel.log", "utf8");
   const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
   if (!url) return false;
   process.env.FISH_RECEIPT_URL = `${url[0]}/bill-receipt`;
   return publicReady();
  }, "Public receipt tunnel");
  // Update every existing override so a restart cannot pick up the old tunnel URL.
  for (const name of [".env", ".env.local"]) {
   if (!existsSync(name)) continue;
   const lines = readFileSync(name, "utf8").split("\n");
   const index = lines.findIndex((line) => /^FISH_RECEIPT_URL=/.test(line));
   if (index >= 0) lines[index] = `FISH_RECEIPT_URL=${process.env.FISH_RECEIPT_URL}`;
   else if (name === ".env") lines.push(`FISH_RECEIPT_URL=${process.env.FISH_RECEIPT_URL}`);
   writeFileSync(name, lines.join("\n"));
  }
 } else console.log("Public receipt tunnel is reachable; reused it.");
 if (!checking) {
  const refresh = spawn(process.execPath, ["scripts/configure-fish-receipt.mjs", "--refresh-url"], { stdio: "inherit", env: process.env });
  const code = await new Promise((done, reject) => { refresh.on("exit", done); refresh.on("error", reject); });
  if (code !== 0) throw new Error("Fish URL refresh failed");
 }
 for (const [label, id] of [["Bill-request", process.env.FISH_AGENT_ID], ["Billing-review", process.env.FISH_REVIEW_AGENT_ID]]) {
  const agent = await fish(`agents/${id}`);
  if (agent.publication_state !== "live" || agent.status !== "active") throw new Error(`${label} Fish agent is not active and published`);
  console.log(`${label} Fish agent is published.`);
 }
 const toolId = JSON.parse(readFileSync("data/fish-receipt-tool.json", "utf8")).id;
 const tool = await fish(`tools/${toolId}`);
 const config = await fish(`agents/${process.env.FISH_AGENT_ID}/config`);
 if (tool.url !== process.env.FISH_RECEIPT_URL || !config.tools.enabled || !config.tools.tool_ids.includes(toolId)) throw new Error("Fish receipt tool URL or attachment does not match");
 console.log(`Receipt check works: ${await receipt(process.env.FISH_RECEIPT_URL)}.`);
 if (existsSync("data/public-mirror.json")) {
  const mirror = spawn(process.execPath, ["scripts/demo-publish.mjs", ...(checking ? ["--check"] : [])], { stdio: "inherit", env: process.env });
  const code = await new Promise((done, reject) => { mirror.on("exit", done); mirror.on("error", reject); });
  if (code !== 0) throw new Error("Public website mirror is not ready");
 }
 console.log(`DEMO READY: ${base}. No calls placed and no cases reset by startup.`);
 if (checking) process.exit(0);
 console.log("Keep this terminal open. Ctrl+C stops the services this command started. Run npm run demo:check before presenting.");
 setInterval(() => {}, 60000);
} catch (error) { console.error(error.message); stop(1); }
