import { formatDollars } from "./money";
import type { FindingInput, ParsedBill, RecordInput } from "./types";

// Demo-only synonyms. Unknown descriptions fall back to a literal substring match, so real bills will mostly need review.
const terms: Record<string, string[]> = {
  "Emergency room visit": ["emergency room", "er visit"],
  "Emergency physician services": ["emergency room", "er visit"],
  "CT head without contrast": ["ct head", "ct scan"],
  "Chest X-ray": ["x-ray"],
  "Laceration repair": ["suture", "laceration repair"],
  Medication: ["medication"],
  "Specialist consultation": ["specialist consultation", "specialist encounter"]
};

/** Compares billed services with the available clinical record without treating missing data as an error. */
export function reconcile(bill: ParsedBill, records: RecordInput[]): FindingInput[] {
  const seen = new Set<string>();
  const findings = bill.items.map((item, lineIndex): FindingInput => {
    const key = `${item.description.toLowerCase()}|${item.serviceDate}|${item.amountCents}`;
    const duplicate = seen.has(key);
    seen.add(key);
    const words = terms[item.description] ?? [item.description.toLowerCase()];
    const matches = records.filter((record) => words.some((word) => record.description.toLowerCase().includes(word)));
    const dated = matches.filter((record) => record.date === item.serviceDate);
    const clinicalStatus = duplicate ? "DUPLICATE_SUSPECTED" : dated.length ? "SUPPORTED" : matches.length ? "DATE_MISMATCH" : records.length ? "NO_MATCH_FOUND" : "INSUFFICIENT_DATA";
    return {
      lineIndex, description: item.description, amountCents: item.amountCents, clinicalStatus,
      pricingStatus: "NOT_ASSESSED", confidence: duplicate ? 0.9 : dated.length ? 0.97 : 0.35,
      evidence: dated.map((record) => `${record.description} (${record.date})`),
      explanation: clinicalStatus === "SUPPORTED" ? "A corresponding service appears in the available medical record." : clinicalStatus === "DUPLICATE_SUSPECTED" ? "A matching line item appears more than once; ask billing to verify it." : "No corresponding service was found in the available medical record. This does not prove the charge is incorrect.",
      action: clinicalStatus === "SUPPORTED" ? "NONE" : "REQUEST_REVIEW"
    };
  });
  const sum = bill.items.reduce((total, item) => total + item.amountCents, 0);
  if (sum !== bill.totalCents) findings.push({ lineIndex: null, description: "Bill total", amountCents: bill.totalCents, clinicalStatus: "AMOUNT_REVIEW", pricingStatus: "NOT_ASSESSED", confidence: 1, evidence: [`Line items total ${formatDollars(sum)}; stated total is ${formatDollars(bill.totalCents)}.`], explanation: "The itemized charges do not add up to the stated bill total.", action: "REQUEST_REVIEW" });
  return findings;
}
