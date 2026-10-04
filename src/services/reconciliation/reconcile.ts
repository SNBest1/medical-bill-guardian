import type { Finding, ItemizedBill, MedicalRecord } from "../../types/domain";
import { recipeTerms } from "../billing/recipes";

/** Words that identify a billed service in a record name. A term starting with "=" must equal the whole record name. */
const terms: Record<string, string[]> = {
  ...recipeTerms,
  "Emergency room": ["emergency room", "er visit"],
  "CT scan": ["ct scan"],
  "X-ray": ["x-ray"],
  "Suture repair": ["suture", "laceration repair"],
  Medication: ["medication"],
  "Specialist consultation": ["specialist consultation", "specialist encounter"]
};

/** Compares billed services with the available clinical record without treating missing data as an error. */
export function reconcile(bill: ItemizedBill, records: MedicalRecord[]): Finding[] {
  const seen = new Set<string>();
  const findings = bill.items.map((item): Finding => {
    const key = `${item.description.toLowerCase()}|${item.serviceDate}|${item.amount}`;
    const duplicate = seen.has(key);
    seen.add(key);
    const words = terms[item.description] ?? [item.description.toLowerCase()];
    const matches = records.filter((record) => { const name = record.description.toLowerCase(); return words.some((word) => word.startsWith("=") ? name === word.slice(1) : name.includes(word)); });
    const dated = matches.filter((record) => record.date === item.serviceDate);
    const clinicalStatus = duplicate ? "DUPLICATE_SUSPECTED" : dated.length ? "SUPPORTED" : matches.length ? "DATE_MISMATCH" : records.length ? "NO_MATCH_FOUND" : "INSUFFICIENT_DATA";
    const evidence = dated.map((record) => `${record.description} (${record.date})`);
    return {
      billItemId: item.id, description: item.description, amount: item.amount, clinicalStatus,
      pricingStatus: "NOT_ASSESSED", confidence: duplicate ? 0.9 : dated.length ? 0.97 : 0.35,
      evidence, evidenceRecordIds: dated.map((record) => record.id),
      explanation: clinicalStatus === "SUPPORTED" ? "A corresponding service appears in the available medical record." : clinicalStatus === "DUPLICATE_SUSPECTED" ? "A matching line item appears more than once; ask billing to verify it." : "No corresponding service was found in the available medical record. This does not prove the charge is incorrect.",
      action: clinicalStatus === "SUPPORTED" ? "NONE" : "REQUEST_REVIEW"
    };
  });
  const sum = bill.items.reduce((total, item) => total + item.amount, 0);
  if (Math.abs(sum - bill.total) > 0.01) findings.push({ billItemId: "bill-total", description: "Bill total", amount: bill.total, clinicalStatus: "AMOUNT_REVIEW", pricingStatus: "NOT_ASSESSED", confidence: 1, evidence: [`Line items total $${sum.toFixed(2)}; stated total is $${bill.total.toFixed(2)}.`], explanation: "The itemized charges do not add up to the stated bill total.", action: "REQUEST_REVIEW" });
  return findings;
}
