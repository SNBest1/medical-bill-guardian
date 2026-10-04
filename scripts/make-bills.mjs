import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scenarios } from "../src/services/scenario-data.ts";

/**
 * Renders each judge scenario's itemized statement as a text-selectable PDF in public/bills/
 * using headless Chrome. Every number comes from the scenario's statement, so the PDF and the
 * local fixture can never disagree. Synthetic data only.
 *
 * Usage: node scripts/make-bills.mjs
 */

const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const money = (value) => `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function parse(statement) {
  const lines = statement.split("\n").map((line) => line.trim());
  const field = (name) => lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2);
  const start = lines.indexOf("Charges"), end = lines.findIndex((line) => line.startsWith("Total: "));
  const items = lines.slice(start + 1, end).map((line) => { const [description, code, amount] = line.split("|").map((part) => part.trim()); return { description, code: code === "-" ? "" : code, amount: Number(amount) }; });
  return { invoice: field("Invoice"), serviceDate: field("Service date"), adjustments: Number(field("Insurance adjustments")), responsibility: Number(field("Patient responsibility")), total: Number(field("Total")), items };
}

function html(scenario) {
  const bill = parse(scenario.statement);
  const { hospital, patient } = scenario;
  const rows = bill.items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.description)}</td><td>${esc(item.code || "—")}</td><td class="r">${money(item.amount)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Itemized Statement ${bill.invoice}</title><style>
@page{size:Letter;margin:0.7in}*{box-sizing:border-box}body{font:12px/1.5 Helvetica,Arial,sans-serif;color:#1d2b36;margin:0}
.head{display:flex;justify-content:space-between;border-bottom:2px solid #1d2b36;padding-bottom:14px}.head h1{font-size:20px;margin:0 0 4px}.head .r{text-align:right}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:26px 0 8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 28px}.meta div{display:flex;justify-content:space-between;border-bottom:1px solid #d6dde2;padding:4px 0}
table{width:100%;border-collapse:collapse;margin-top:6px}th{text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;border-bottom:2px solid #1d2b36;padding:7px 6px}td{padding:8px 6px;border-bottom:1px solid #d6dde2}.r{text-align:right}
.totals{margin:14px 0 0 auto;width:55%}.totals div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #d6dde2}.totals .grand{font-weight:700;font-size:14px;border-bottom:2px solid #1d2b36}
.note{margin-top:30px;font-size:10px;color:#5b6b78;border-top:1px solid #d6dde2;padding-top:10px}</style></head><body>
<div class="head"><div><h1>${esc(hospital.name)}</h1><div>${esc(hospital.street)}<br>${esc(hospital.city)}, ${hospital.state} ${hospital.zip}<br>Patient Billing Office</div></div><div class="r"><h1>ITEMIZED STATEMENT</h1><div>Invoice Number: ${bill.invoice}</div></div></div>
<h2>Account details</h2><div class="meta">
<div><span>Patient</span><b>${esc(patient.firstName)} ${esc(patient.lastName)}</b></div><div><span>Invoice Number</span><b>${bill.invoice}</b></div>
<div><span>Address</span><span>${esc(patient.street)}, ${esc(patient.city)}, ${patient.state} ${patient.zip}</span></div><div><span>Service Date</span><b>${longDate(bill.serviceDate)}</b></div>
<div><span>Provider</span><span>${esc(hospital.name)}</span></div><div><span>Statement Date</span><span>${longDate(bill.serviceDate)}</span></div></div>
<h2>Itemized charges</h2><table><thead><tr><th>#</th><th>Description</th><th>Code</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals"><div><span>Insurance adjustments</span><span>${money(bill.adjustments)}</span></div><div><span>Patient responsibility</span><span>${money(bill.responsibility)}</span></div><div class="grand"><span>Total charges</span><span>${money(bill.total)}</span></div></div>
<div class="note">Payment of ${money(scenario.transaction.amount)} was received on ${longDate(scenario.transaction.date)}. Questions about this statement: contact the Patient Billing Office and reference the invoice number above.<br>SYNTHETIC DOCUMENT — fictional patient, provider, and charges, created for a software demonstration. Not a real bill.</div>
</body></html>`;
}

mkdirSync("public/bills", { recursive: true });
const work = join(tmpdir(), `bills-${Date.now()}`); mkdirSync(work, { recursive: true });
for (const scenario of scenarios) {
  const invoice = parse(scenario.statement).invoice;
  const name = `${scenario.patient.firstName}-${scenario.patient.lastName}-${invoice}`.toLowerCase();
  const source = join(work, `${name}.html`);
  writeFileSync(source, html(scenario));
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=public/bills/${name}.pdf`, `file://${source}`], { stdio: "ignore" });
  console.log(`public/bills/${name}.pdf`);
}
rmSync(work, { recursive: true, force: true });
