#!/usr/bin/env node
// Writes docs/sample-reply-bill.pdf: the synthetic University of Michigan Health statement as a text PDF,
// for a test reply to the Worker's itemized-bill email. Mirrors DEMO_STATEMENT in
// spacetimedb/src/logic/fixtures.ts. No dependencies: a minimal hand-built PDF with Helvetica text.
import { writeFile } from "node:fs/promises";

const lines = [
  "Invoice: UMH-48291", "Provider: University of Michigan Health", "Service date: 2026-09-28", "Setting: OUTPATIENT",
  "Insurance adjustments: 0.00", "Patient responsibility: 4820.00", "Charges",
  "Emergency room visit | 99285 | FACILITY | 1 | 2000.00", "Emergency physician services | 99285 | PROFESSIONAL | 1 | 450.00",
  "CT head without contrast | 70450 | PROFESSIONAL | 1 | 900.00", "Chest X-ray | 71046 | FACILITY | 1 | 240.00",
  "Laceration repair | 12001 | PROFESSIONAL | 1 | 360.00", "Medication | J2405 | FACILITY | 1 | 170.00",
  "Specialist consultation | 99244 | PROFESSIONAL | 1 | 700.00", "Total: 4820.00",
];
const content = ["BT /F1 9 Tf 1 0 0 1 50 760 Tm (SYNTHETIC DEMO STATEMENT - NOT A REAL BILL) Tj ET",
  ...lines.map((line, i) => `BT /F1 12 Tf 1 0 0 1 50 ${730 - i * 18} Tm (${line}) Tj ET`)].join("\n");
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
const start = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${start}\n%%EOF`;
await writeFile(new URL("../docs/sample-reply-bill.pdf", import.meta.url), pdf);
console.log("wrote docs/sample-reply-bill.pdf");
