#!/usr/bin/env node
// Writes docs/sample-reply-bill.pdf: the synthetic University Hospital statement as a text PDF,
// for a test reply to the Worker's itemized-bill email. Mirrors DEMO_STATEMENT in
// spacetimedb/src/logic/fixtures.ts. No dependencies: a minimal hand-built PDF with Helvetica text.
import { writeFile } from "node:fs/promises";

const lines = [
  "Invoice: UH-48291", "Provider: University Hospital", "Service date: 2026-09-28",
  "Insurance adjustments: 0.00", "Patient responsibility: 4820.00", "Charges",
  "Emergency room | 99285 | 1100.00", "CT scan | - | 1800.00", "X-ray | - | 450.00",
  "Suture repair | - | 600.00", "Medication | - | 170.00", "Specialist consultation | - | 700.00",
  "Total: 4820.00",
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
