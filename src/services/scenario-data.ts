import type { MedicalRecord, Transaction } from "../types/domain";
import { generatedStatements } from "./scenario-statements.generated.ts";

/**
 * One synthetic patient the judges can pick. The three picker scenarios are FinchNode's own public
 * demo patients: the clinical records are pulled from FinchNode when the case is investigated, and
 * the itemized statement is generated from those same records (scripts/generate-statements.mjs).
 */
export interface Scenario {
  id: string;
  label: string;
  /** One-line description of the visit that was billed. */
  story: string;
  /** FinchNode public-demo subject whose records back this case. Absent for the original rehearsal case. */
  finchSubject?: string;
  /** The persona title that the same patient carries in FinchNode's sandbox user list (its source organization ends with it). */
  finchSandboxLabel?: string;
  patient: { firstName: string; lastName: string; street: string; city: string; state: string; zip: string };
  hospital: { name: string; street: string; city: string; state: string; zip: string; lat: number; lng: number };
  transaction: Transaction;
  /** Hand-written records for scenarios without a FinchNode subject; FinchNode-backed scenarios leave this empty and read the pull. */
  records: MedicalRecord[];
  statement: string;
  /** What the mock hospital says after the patient authorizes review. */
  outcome: { flagged: string | null; result: "DUPLICATE_REMOVED" | "CHARGE_VERIFIED" | null; explanation: string };
}

/** The one hospital all three FinchNode patients were seen at (their records name "Northstar Health System (Synthetic)"). */
export const northstar = { name: "Northstar Health System", street: "1200 Northstar Parkway", city: "Demo City", state: "CA", zip: "90001", lat: 34.0522, lng: -118.2437 };

const bill = (id: string) => {
  const generated = generatedStatements[id];
  if (!generated) throw new Error(`No generated statement for ${id}; run node scripts/generate-statements.mjs`);
  return generated;
};
const payment = (id: string): Transaction => ({ id: `scenario-${id}`, merchant: northstar.name, amount: bill(id).total, date: bill(id).serviceDate, category: "healthcare" });

export const scenarios: Scenario[] = [
  {
    id: "morgan-wellness",
    label: "Wellness visit: diabetes follow-up",
    story: "Morgan Rivera, 38, had an annual wellness visit with blood work and a diabetes check-in at Northstar Health System.",
    finchSubject: bill("morgan-wellness").subject,
    finchSandboxLabel: "Baseline adult, age 38",
    patient: { firstName: "Morgan", lastName: "Rivera", street: "104 Example Lane", city: "Demo City", state: "CA", zip: "90001" },
    hospital: northstar,
    transaction: payment("morgan-wellness"),
    records: [],
    statement: bill("morgan-wellness").statement,
    outcome: { flagged: "Electrocardiogram, 12-lead", result: "DUPLICATE_REMOVED", explanation: "The hospital confirmed the $310 electrocardiogram duplicated a tracing already included in the annual wellness visit charge and removed it." }
  },
  {
    id: "harriet-kidney",
    label: "Kidney and heart follow-up",
    story: "Harriet Lindqvist, 78, who has chronic kidney disease and heart conditions, had a primary care follow-up with kidney, thyroid, and cholesterol labs at Northstar Health System.",
    finchSubject: bill("harriet-kidney").subject,
    finchSandboxLabel: "Polypharmacy, age 78",
    patient: { firstName: "Harriet", lastName: "Lindqvist", street: "212 Example Court", city: "Demo City", state: "CA", zip: "90001" },
    hospital: northstar,
    transaction: payment("harriet-kidney"),
    records: [],
    statement: bill("harriet-kidney").statement,
    outcome: { flagged: "Electrocardiogram, 12-lead", result: "CHARGE_VERIFIED", explanation: "The hospital located a signed order and tracing for the electrocardiogram filed under a different record number. The $210 charge is valid and stands." }
  },
  {
    id: "theo-asthma",
    label: "Child's asthma follow-up",
    story: "Theo Abernathy, a child with asthma, had an asthma follow-up with a breathing check and new inhalers at Northstar Health System. Nothing is wrong with this bill.",
    finchSubject: bill("theo-asthma").subject,
    finchSandboxLabel: "Pediatric asthma, age 9",
    patient: { firstName: "Theo", lastName: "Abernathy", street: "58 Example Way", city: "Demo City", state: "CA", zip: "90001" },
    hospital: northstar,
    transaction: payment("theo-asthma"),
    records: [],
    statement: bill("theo-asthma").statement,
    outcome: { flagged: null, result: null, explanation: "Every charge is supported by the clinical record; no provider contact is needed." }
  }
];
