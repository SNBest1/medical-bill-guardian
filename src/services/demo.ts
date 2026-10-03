import type { MedicalRecord, Transaction } from "../types/domain";
import { parseItemizedBill } from "./communications/parse-bill";

export const demoTransaction: Transaction = { id: "nessie-demo-4820", merchant: "University Hospital", amount: 4820, date: "2026-09-28", category: "healthcare" };

export const demoRecords: MedicalRecord[] = [
  { id: "record-er", type: "encounter", description: "Emergency room visit after accident", date: "2026-09-28", provider: "University Hospital" },
  { id: "record-ct", type: "imaging", description: "CT scan diagnostic report", date: "2026-09-28", provider: "University Hospital" },
  { id: "record-xray", type: "imaging", description: "X-ray radiology report", date: "2026-09-28", provider: "University Hospital" },
  { id: "record-suture", type: "procedure", description: "Laceration repair with sutures", date: "2026-09-28", provider: "University Hospital" },
  { id: "record-med", type: "medication", description: "Medication administered in ER", date: "2026-09-28", provider: "University Hospital" }
];

export const demoStatement = `Invoice: UH-48291
Provider: University Hospital
Service date: 2026-09-28
Insurance adjustments: 0.00
Patient responsibility: 4820.00
Charges
Emergency room | 99285 | 1100.00
CT scan | - | 1800.00
X-ray | - | 450.00
Suture repair | - | 600.00
Medication | - | 170.00
Specialist consultation | - | 700.00
Total: 4820.00`;

export const demoBill = parseItemizedBill(demoStatement);
