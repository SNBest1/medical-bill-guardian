import type { InsuranceClaim } from "./insurance";
import type { ParsedBill, PriceRate } from "./types";

export interface PriceComparisonResult { lineIndex: number; referenceCents: number; comparedCents: number; comparedField: "ALLOWED" | "BILLED"; multiple: number; basis: "CASH" | "NEGOTIATED"; review: boolean }

/**
 * Compares lines only against a unique published rate matching code, setting, component, and units
 * (and, for an insured claim, the exact payer and plan). With a claim, a line's allowed amount is
 * compared with the contract rate, since gross charges always exceed contract rates and the patient's
 * share comes from the allowed amount; without one, the billed amount is compared with the cash price
 * and flagged at 2x. A difference is a question for billing, never a finding of error.
 */
export function comparePrices(bill: ParsedBill, claim: InsuranceClaim | null, rates: PriceRate[]): PriceComparisonResult[] {
  return bill.items.flatMap((item, lineIndex) => {
    if (!item.code || !item.setting || !item.component || !item.units) return [];
    const matches = rates.filter((rate) => rate.code === item.code && rate.setting === item.setting && rate.component === item.component && rate.units === item.units && rate.modifiers.length === 0
      && (claim ? rate.basis === "NEGOTIATED" && claim.network === "IN_NETWORK" && rate.payer === claim.payer && rate.plan === claim.plan : rate.basis === "CASH"));
    if (matches.length !== 1) return [];
    const rate = matches[0];
    const claimLine = claim?.lines[lineIndex]?.code === item.code ? claim.lines[lineIndex] : undefined;
    if (claim && !claimLine) return [];
    const comparedCents = claimLine ? claimLine.allowedCents : item.amountCents;
    const multiple = Math.round((comparedCents / rate.amountCents) * 100) / 100;
    const review = claimLine ? comparedCents > Math.round(rate.amountCents * 1.01) : multiple >= 2;
    return [{ lineIndex, referenceCents: rate.amountCents, comparedCents, comparedField: claimLine ? "ALLOWED" : "BILLED", multiple, basis: rate.basis, review }];
  });
}
