import type { RecordInput, ResolutionInput } from "./types";

/** Real provider and CPT/HCPCS codes, so the published UM Health price file can be compared. */
export const DEMO_PROVIDER = "University of Michigan Health";
export const DEMO_TRANSACTION = { id: "nessie-demo-4820", merchant: DEMO_PROVIDER, amountCents: 482000, date: "2026-09-28" };
export const DEMO_CASE_LABEL = "CASE-4821";
/** The mock hospital's statement arrives this long after the bill request. */
export const BILL_DELAY_MICROS = 2_000_000n;

export const DEMO_RECORDS: RecordInput[] = [
  { kind: "encounter", description: "Emergency room visit after accident", date: "2026-09-28", provider: DEMO_PROVIDER },
  { kind: "imaging", description: "CT head scan diagnostic report", date: "2026-09-28", provider: DEMO_PROVIDER },
  { kind: "imaging", description: "Chest X-ray radiology report", date: "2026-09-28", provider: DEMO_PROVIDER },
  { kind: "procedure", description: "Laceration repair with sutures", date: "2026-09-28", provider: DEMO_PROVIDER },
  { kind: "medication", description: "Medication administered in ER", date: "2026-09-28", provider: DEMO_PROVIDER }
];

/** Statement grammar: optional "Setting:" header; charges as "description | code | component | units | amount". */
export const DEMO_STATEMENT = `Invoice: UMH-48291
Provider: ${DEMO_PROVIDER}
Service date: 2026-09-28
Setting: OUTPATIENT
Insurance adjustments: 0.00
Patient responsibility: 4820.00
Charges
Emergency room visit | 99285 | FACILITY | 1 | 2000.00
Emergency physician services | 99285 | PROFESSIONAL | 1 | 450.00
CT head without contrast | 70450 | PROFESSIONAL | 1 | 900.00
Chest X-ray | 71046 | FACILITY | 1 | 240.00
Laceration repair | 12001 | PROFESSIONAL | 1 | 360.00
Medication | J2405 | FACILITY | 1 | 170.00
Specialist consultation | 99244 | PROFESSIONAL | 1 | 700.00
Total: 4820.00`;

export const billRequestTranscript = (provider: string) => `Demo request to ${provider} billing for an itemized statement, service dates, codes, charges, adjustments, and patient responsibility.`;

/** The seeded provider confirmation returned after the patient authorizes review. */
export function billingReview(provider: string, invoiceId: string, description: string): { transcript: string; resolution: ResolutionInput } {
  return {
    transcript: `Demo request to ${provider} billing about invoice ${invoiceId}: verify the ${description} charge and provide documentation or a correction.`,
    resolution: { result: "DUPLICATE_REMOVED", originalTotalCents: 482000, correctedTotalCents: 412000, adjustmentCents: 70000, explanation: "The hospital confirmed that the $700 specialist consultation duplicated services already included in the emergency room charge and removed it." }
  };
}
