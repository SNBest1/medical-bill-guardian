import type { RecordInput, ResolutionInput } from "./types";

export const DEMO_TRANSACTION = { id: "nessie-demo-4820", merchant: "University Hospital", amountCents: 482000, date: "2026-09-28" };
export const DEMO_CASE_LABEL = "CASE-4821";
/** The mock hospital's statement arrives this long after the bill request. */
export const BILL_DELAY_MICROS = 2_000_000n;

export const DEMO_RECORDS: RecordInput[] = [
  { kind: "encounter", description: "Emergency room visit after accident", date: "2026-09-28", provider: "University Hospital" },
  { kind: "imaging", description: "CT scan diagnostic report", date: "2026-09-28", provider: "University Hospital" },
  { kind: "imaging", description: "X-ray radiology report", date: "2026-09-28", provider: "University Hospital" },
  { kind: "procedure", description: "Laceration repair with sutures", date: "2026-09-28", provider: "University Hospital" },
  { kind: "medication", description: "Medication administered in ER", date: "2026-09-28", provider: "University Hospital" }
];

export const DEMO_STATEMENT = `Invoice: UH-48291
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

export const billRequestTranscript = (provider: string) => `Demo request to ${provider} billing for an itemized statement, service dates, codes, charges, adjustments, and patient responsibility.`;

/** The seeded provider confirmation returned after the patient authorizes review. */
export function billingReview(provider: string, invoiceId: string, description: string): { transcript: string; resolution: ResolutionInput } {
  return {
    transcript: `Demo request to ${provider} billing about invoice ${invoiceId}: verify the ${description} charge and provide documentation or a correction.`,
    resolution: { result: "DUPLICATE_REMOVED", originalTotalCents: 482000, correctedTotalCents: 412000, adjustmentCents: 70000, explanation: "The hospital confirmed that the $700 specialist consultation duplicated services already included in the emergency room charge and removed it." }
  };
}

export const notificationTranscript = "Demo in-app notification";
