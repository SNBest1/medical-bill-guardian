import type { ParsedBill } from "./types";

export interface ClaimLine { code: string; billedCents: number; allowedCents: number }
export interface InsuranceClaim {
  claimId: string;
  /** FinchNode's ClaimRecord carries no dollar fields, so the demo claim's amounts are synthetic. */
  synthetic: boolean;
  invoiceId: string;
  payer: string;
  plan: string;
  network: "IN_NETWORK" | "OUT_OF_NETWORK" | "UNKNOWN";
  claimStatus: "FINAL" | "PENDING" | "DENIED" | "UNKNOWN";
  lines: ClaimLine[];
  insurerPaidCents: number; otherPayerPaidCents: number; deductibleCents: number; copayCents: number; coinsuranceCents: number; noncoveredCents: number;
}

export interface InsuranceSummary {
  payer: string; plan: string; network: string; claimStatus: string; synthetic: boolean;
  billedCents: number; allowedCents: number; contractualCents: number; insurerPaidCents: number;
  deductibleCents: number; copayCents: number; coinsuranceCents: number; noncoveredCents: number;
  patientResponsibilityCents: number; possibleOverpaymentCents: number;
  status: "RECONCILED" | "REVIEW_REQUIRED"; notes: string[];
}

/**
 * Synthetic adjudicated claim for the demo invoice. Payer/plan are a real row in the UM Health
 * price file, so allowed amounts can be compared with that plan's contract rates; the CT line is
 * allowed at twice its contract rate on purpose, as the demo's price lead.
 */
const DEMO_CLAIM: InsuranceClaim = {
  claimId: "CLM-SYNTH-48291", synthetic: true, invoiceId: "UMH-48291",
  payer: "BCBS [100001]", plan: "BCBS MICHIGAN TRADITIONAL [10000102]", network: "IN_NETWORK", claimStatus: "FINAL",
  lines: [
    { code: "99285", billedCents: 200000, allowedCents: 168363 },
    { code: "99285", billedCents: 45000, allowedCents: 23632 },
    { code: "70450", billedCents: 90000, allowedCents: 29428 },
    { code: "71046", billedCents: 24000, allowedCents: 18622 },
    { code: "12001", billedCents: 36000, allowedCents: 12766 },
    { code: "J2405", billedCents: 17000, allowedCents: 9500 },
    { code: "99244", billedCents: 70000, allowedCents: 40000 },
  ],
  insurerPaidCents: 201849, otherPayerPaidCents: 0, deductibleCents: 50000, copayCents: 0, coinsuranceCents: 50462, noncoveredCents: 0,
};

/** The claim covering an invoice; only the demo invoice has one. */
export function claimForInvoice(invoiceId: string): InsuranceClaim | null {
  // structuredClone is unavailable in the SpacetimeDB module runtime; copy by hand.
  return invoiceId === DEMO_CLAIM.invoiceId ? { ...DEMO_CLAIM, lines: DEMO_CLAIM.lines.map((line) => ({ ...line })) } : null;
}

/** Deducts the insurer's adjudication from the bill; inconsistent numbers become review notes, not guesses. */
export function summarizeClaim(claim: InsuranceClaim, bill: ParsedBill, paidCents: number): InsuranceSummary {
  const billedCents = claim.lines.reduce((sum, line) => sum + line.billedCents, 0);
  const allowedCents = claim.lines.reduce((sum, line) => sum + line.allowedCents, 0);
  const patientResponsibilityCents = claim.deductibleCents + claim.copayCents + claim.coinsuranceCents + claim.noncoveredCents;
  const notes: string[] = [];
  if (claim.invoiceId !== bill.invoiceId) notes.push("The claim is for a different invoice.");
  if (billedCents !== bill.totalCents) notes.push("The claim's billed amount does not match the statement total.");
  if (allowedCents !== claim.insurerPaidCents + claim.otherPayerPaidCents + claim.deductibleCents + claim.copayCents + claim.coinsuranceCents) notes.push("The allowed amount does not reconcile with payments and the patient's share.");
  if (claim.claimStatus !== "FINAL") notes.push(`The claim is ${claim.claimStatus.toLowerCase()}; the patient's share is not final.`);
  const possibleOverpaymentCents = Math.max(0, paidCents - patientResponsibilityCents);
  if (possibleOverpaymentCents > 0) notes.push("The payment exceeds the patient's share on the claim; this is a possible overpayment, not a confirmed refund.");
  return {
    payer: claim.payer, plan: claim.plan, network: claim.network, claimStatus: claim.claimStatus, synthetic: claim.synthetic,
    billedCents, allowedCents, contractualCents: billedCents - allowedCents - claim.noncoveredCents, insurerPaidCents: claim.insurerPaidCents,
    deductibleCents: claim.deductibleCents, copayCents: claim.copayCents, coinsuranceCents: claim.coinsuranceCents, noncoveredCents: claim.noncoveredCents,
    patientResponsibilityCents, possibleOverpaymentCents, status: notes.length ? "REVIEW_REQUIRED" : "RECONCILED", notes,
  };
}
