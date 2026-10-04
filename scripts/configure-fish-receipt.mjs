import { loadEnvFile } from "node:process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}
const { FISH_API_KEY: key, FISH_AGENT_ID: agent, FISH_RECEIPT_TOKEN: token, FISH_RECEIPT_URL: url } = process.env;
if (!key || !agent || !token || token.length < 32 || !url?.startsWith("https://")) throw new Error("Set Fish agent credentials, FISH_RECEIPT_TOKEN, and HTTPS FISH_RECEIPT_URL");
const request = async (path, method = "GET", body) => {
  const response = await fetch(`https://api.fish.audio/v1/agent/${path}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Fish ${method} failed (${response.status}); no call was placed`);
  return response.json();
};
const config = await request(`agents/${agent}/config`);
if (!existsSync("data/fish-config-before-receipt.json")) writeFileSync("data/fish-config-before-receipt.json", JSON.stringify(config));
const tool = {
  name: "check_bill_receipt", description: "Read the active investigation's hospital-text/PDF receipt status. Call when hospital billing says they sent the PDF or asks whether it arrived. Never infer receipt from their assertion.", tool_type: "webhook", method: "POST", url,
  arguments: [{ name: "case_id", description: "Use receipt_case_id from the system prompt exactly." }, { name: "attempt_id", description: "Use receipt_attempt_id from the system prompt exactly." }],
  content_type: "application/json", body_template: '{"case_id":"{{case_id}}","attempt_id":"{{attempt_id}}"}', headers: [{ name: "Authorization", value: `Bearer ${token}`, kind: "authorization_bearer" }], timeout_seconds: 15, error_handling: "passthrough", expects_response: true, execution_mode: "blocking",
};
let toolId;
if (existsSync("data/fish-receipt-tool.json")) { toolId = JSON.parse(readFileSync("data/fish-receipt-tool.json")).id; await request(`tools/${toolId}`, "PATCH", tool); }
else { const created = await request("tools", "POST", tool); toolId = created.id ?? created.tool_id ?? created._id; if (!toolId) throw new Error("Fish did not return a tool id"); writeFileSync("data/fish-receipt-tool.json", JSON.stringify({ id: toolId })); }
const doc = readFileSync("docs/FISH_AGENT_PROMPT.md", "utf8");
const systemPrompt = doc.split("## System prompt")[1].split("```")[1].trim();
await request(`agents/${agent}/config`, "PATCH", { prompt: { system_prompt: systemPrompt }, tools: { enabled: true, tool_ids: [...new Set([...config.tools.tool_ids, toolId])] } });
await request(`agents/${agent}/publish`, "POST", { version_title: "Conversational PDF receipt confirmation", version_description: "Checks the current Guardian investigation before acknowledging receipt. Distinguishes waiting, processing, read, and failed." });
const saved = await request(`agents/${agent}/config`);
if (!saved.tools.tool_ids.includes(toolId) || saved.prompt.system_prompt !== systemPrompt) throw new Error("Fish config verification failed");
console.log("Fish receipt tool attached; conversational prompt published and verified. No phone call placed.");
