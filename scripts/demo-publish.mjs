import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, copyFileSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const base = "http://127.0.0.1:3100";
const stateFile = "data/public-mirror.json";
const checking = process.argv.includes("--check");
const refresh = process.argv.includes("--refresh");
const runtimeEnv = { ...process.env, HOSTED_DEMO: "false", GUARDIAN_BUILD_DIR: ".next-public" };
async function request(url) {
 const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
 if (!response.ok) throw new Error(`Public mirror endpoint returned ${response.status}`);
 return response;
}
async function ready(url) {
 try { const list = await (await request(`${url}/api/scenarios`)).json(); return Array.isArray(list) && list.some((item) => item.id === "morgan-wellness"); } catch { return false; }
}
async function matches(origin) {
 try {
  const local = await (await request(`${base}/api/cases`)).json();
  const remote = await (await request(`${origin}/api/cases`)).json();
  const page = await (await request(origin)).text();
  return page.includes("Medical Bill Guardian") && JSON.stringify(local) === JSON.stringify(remote);
 } catch { return false; }
}
async function waitFor(check, label, milliseconds = 60000) {
 const until = Date.now() + milliseconds;
 while (Date.now() < until) { if (await check()) return; await new Promise((done) => setTimeout(done, 700)); }
 throw new Error(`${label} did not become ready; see data/demo-logs/public-*.log`);
}
function start(name, command, args) {
 const fd = openSync(`data/demo-logs/public-${name}.log`, "a");
 const child = spawn(command, args, { cwd: process.cwd(), env: runtimeEnv, detached: true, stdio: ["ignore", fd, fd] });
 closeSync(fd); child.unref(); return child.pid;
}
mkdirSync("data/demo-logs", { recursive: true });
if (checking) {
 if (!existsSync(stateFile)) throw new Error("Public mirror has not been published; run npm run demo:publish");
 const state = JSON.parse(readFileSync(stateFile, "utf8"));
 if (!await matches(state.origin) || !await matches(state.url)) throw new Error("Public mirror is offline or does not match the local cases. Run npm run demo:publish.");
 console.log(`Public mirror verified: ${state.url}; same local cases and integrations.`); process.exit(0);
}
if (!existsSync(".vercel/project.json")) throw new Error("Link this checkout to the medical-bill-guardian Vercel project first");
if (!await ready(base)) {
 if (spawnSync("npm", ["run", "build"], { stdio: "inherit", env: runtimeEnv }).status !== 0) throw new Error("Public server build failed");
 start("server", process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"]);
 await waitFor(() => ready(base), "Production mirror server");
}
if (!await matches("http://127.0.0.1:3000")) throw new Error("Production mirror is not reading the same cases as localhost");
let state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : undefined;
if (state && !refresh && await matches(state.origin) && await matches(state.url)) {
 console.log(`Public mirror already connected: ${state.url}`); process.exit(0);
}
if (!state || !await matches(state.origin)) {
 const binary = resolve("data/tools/cloudflared");
 if (!existsSync(binary)) throw new Error("Official cloudflared binary is missing; see DEMO_STARTUP.md");
 writeFileSync("data/demo-logs/public-tunnel.log", "");
 const pid = start("tunnel", binary, ["tunnel", "--url", base, "--no-autoupdate"]);
 let origin;
 await waitFor(async () => {
  origin = readFileSync("data/demo-logs/public-tunnel.log", "utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (origin) writeFileSync(stateFile, JSON.stringify({ origin, tunnelPid: pid }, null, 2));
  return origin && await matches(origin);
 }, "Public website tunnel", 120000);
 state = { origin, tunnelPid: pid };
}
// This deployment contains only a reverse proxy. Credentials and case data stay local.
const directory = resolve("data/vercel-live-mirror");
mkdirSync(`${directory}/.vercel`, { recursive: true });
copyFileSync(".vercel/project.json", `${directory}/.vercel/project.json`);
writeFileSync(`${directory}/package.json`, JSON.stringify({ name: "guardian-live-mirror", private: true, version: "1.0.0" }));
writeFileSync(`${directory}/vercel.json`, JSON.stringify({ framework: null, buildCommand: null, installCommand: null, outputDirectory: ".", rewrites: [{ source: "/", destination: `${state.origin}/` }, { source: "/:path*", destination: `${state.origin}/:path*` }] }, null, 2));
writeFileSync(`${directory}/.vercelignore`, ".vercel/\n");
const deployed = spawnSync("vercel", ["--prod", "--yes", "--cwd", directory], { stdio: "inherit" });
if (deployed.status !== 0) throw new Error("Vercel mirror deployment failed");
state.url = "https://medical-bill-guardian.vercel.app";
writeFileSync(stateFile, JSON.stringify(state, null, 2));
await waitFor(() => matches(state.url), "Vercel mirror", 30000);
console.log(`LIVE WEBSITE: ${state.url}. Same database, Fish calls, patient texts, and Nessie credits as localhost.`);
console.log("Keep this computer awake with the app, receiver, worker, production mirror and tunnels running. npm run demo:start restores the mirror after a restart.");
