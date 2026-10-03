import type { ItemizedBill, MedicalRecord, Transaction } from "../types/domain";

export const demoTransaction: Transaction = { id: "nessie-demo-4820", merchant: "University Hospital", amount: 4820, date: "2026-09-28", category: "healthcare" };

export const demoRecords: MedicalRecord[] = [
  { id: "record-er", type: "encounter", description: "Emergency room visit after accident", date: "2026-09-28", provider: "University Hospital" },
  { id: "record-ct", type: "imaging", description: "CT scan diagnostic report", date: "2026-09-28", provider: "University Hospital" },
  { id: "record-xray", type: "imaging", description: "X-ray radiology report", date: "2026-09-28", provider: "University Hospital" },
  { id: "record-suture", type: "procedure", description: "Laceration repair with sutures", date: "2026-09-28", provider: "University Hospital" },
  { id: "record-med", type: "medication", description: "Medication administered in ER", date: "2026-09-28", provider: "University Hospital" }
];

export const demoBill: ItemizedBill = {
  invoiceId: "UH-48291", provider: "University Hospital", total: 4820,
  items: [
    { id: "bill-er", description: "Emergency room", code: "99285", amount: 1100, serviceDate: "2026-09-28" },
    { id: "bill-ct", description: "CT scan", amount: 1800, serviceDate: "2026-09-28" },
    { id: "bill-xray", description: "X-ray", amount: 450, serviceDate: "2026-09-28" },
    { id: "bill-suture", description: "Suture repair", amount: 600, serviceDate: "2026-09-28" },
    { id: "bill-med", description: "Medication", amount: 170, serviceDate: "2026-09-28" },
    { id: "bill-specialist", description: "Specialist consultation", amount: 700, serviceDate: "2026-09-28" }
  ]
};
