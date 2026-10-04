import { loadEnvFile } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { scenarios } from "../src/services/scenarios.ts";
try { loadEnvFile(".env.local"); } catch {}
try { loadEnvFile(".env"); } catch {}

/**
 * Creates one synthetic Nessie customer, checking account, hospital merchant, and hospital
 * purchase per judge scenario. Dry run by default: prints the requests without sending them.
 * Resulting IDs are written to the ignored data/nessie-seed.json; existing scenarios are skipped.
 *
 * Usage: node scripts/nessie-seed.mjs [--apply] [scenario-id ...]
 */

const apply = process.argv.includes("--apply");
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const selected = scenarios.filter((scenario) => only.length === 0 || only.includes(scenario.id));
if (selected.length === 0) throw new Error(`No matching scenario. Available: ${scenarios.map((s) => s.id).join(", ")}`);

const seedPath = "data/nessie-seed.json";
const seeded = existsSync(seedPath) ? JSON.parse(readFileSync(seedPath, "utf8")) : {};

const key = process.env.NESSIE_API_KEY;
const base = (process.env.NESSIE_BASE_URL || "").replace(/\/$/, "");
if (apply) {
  if (!key || !base) throw new Error("Configure NESSIE_API_KEY and NESSIE_BASE_URL before using --apply");
  if (new URL(base).protocol !== "https:") throw new Error("Nessie requires an HTTPS endpoint");
}

async function post(path, body) {
  if (!apply) { console.log(`  [dry run] POST ${path}\n    ${JSON.stringify(body)}`); return { _id: `dry-run-${path.split("/").pop()}` }; }
  const url = new URL(`${base}${path}`);
  url.searchParams.set("key", key);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Nessie POST ${path} failed: ${response.status} ${await response.text()}`);
  const created = (await response.json()).objectCreated;
  if (!created?._id) throw new Error(`Nessie POST ${path} returned no object ID`);
  return created;
}

for (const scenario of selected) {
  console.log(`\n${scenario.id}: ${scenario.patient.firstName} ${scenario.patient.lastName} -> ${scenario.hospital.name} ($${scenario.transaction.amount})`);
  if (seeded[scenario.id]) { console.log("  already seeded; skipping"); continue; }
  const { patient, hospital, transaction } = scenario;
  const customer = await post("/customers", { first_name: patient.firstName, last_name: patient.lastName, address: { street_number: patient.street.split(" ")[0], street_name: patient.street.split(" ").slice(1).join(" "), city: patient.city, state: patient.state, zip: patient.zip } });
  const account = await post(`/customers/${customer._id}/accounts`, { type: "Checking", nickname: `${patient.firstName}'s checking`, rewards: 0, balance: 15000 });
  const merchant = await post("/merchants", { name: hospital.name, category: ["healthcare"], address: { street_number: hospital.street.split(" ")[0], street_name: hospital.street.split(" ").slice(1).join(" "), city: hospital.city, state: hospital.state, zip: hospital.zip }, geocode: { lat: 0, lng: 0 } });
  const purchase = await post(`/accounts/${account._id}/purchases`, { merchant_id: merchant._id, medium: "balance", purchase_date: transaction.date, amount: transaction.amount, description: `${hospital.name} patient payment` });
  if (apply) {
    seeded[scenario.id] = { customerId: customer._id, accountId: account._id, merchantId: merchant._id, purchaseId: purchase._id };
    mkdirSync("data", { recursive: true });
    writeFileSync(seedPath, JSON.stringify(seeded, null, 2));
    console.log(`  created and saved IDs to ${seedPath}`);
  }
}
if (!apply) console.log("\nDry run only. Re-run with --apply to send these to the Nessie sandbox.");
