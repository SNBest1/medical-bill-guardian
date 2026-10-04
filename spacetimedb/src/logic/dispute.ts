import { formatDollars } from "./money";
import type { InsuranceSummary } from "./insurance";
import type { PriceComparisonResult } from "./pricing";
import type { FindingInput, ParsedBill, PriceSource } from "./types";

/**
 * Deterministic dispute letter from verified case facts: unsupported charges, allowed-vs-contract
 * price questions with the published source, and the claim's patient share. It asks for
 * documentation or correction; it never asserts fraud, a confirmed error, or savings.
 */
export function composeDispute(input: { caseLabel: string; bill: ParsedBill; findings: FindingInput[]; comparisons: PriceComparisonResult[]; summary: InsuranceSummary | null; paidCents: number; source: PriceSource }): string {
  const { bill, findings, comparisons, summary, source } = input;
  const price = new Map(comparisons.filter((item) => item.review).map((item) => [item.lineIndex, item]));
  const questioned = findings.filter((finding) => finding.lineIndex !== null && (finding.action === "REQUEST_REVIEW" || price.has(finding.lineIndex)));
  const lines = questioned.map((finding) => {
    const item = bill.items[finding.lineIndex!];
    const reasons: string[] = [];
    if (finding.clinicalStatus === "DUPLICATE_SUSPECTED") reasons.push("appears more than once on the statement");
    else if (finding.clinicalStatus !== "SUPPORTED") reasons.push("has no matching service in the patient's available records; please provide documentation or remove it");
    const lead = price.get(finding.lineIndex!);
    if (lead) reasons.push(`the insurer allowed ${formatDollars(lead.comparedCents)}, while the published ${summary?.plan ?? "plan"} contract rate is ${formatDollars(lead.referenceCents)} (${source.name}, as of ${source.asOf}: ${source.url}); please explain or reprocess`);
    return `- ${finding.description}${item?.code ? ` (${item.code})` : ""} ${formatDollars(finding.amountCents)}: ${reasons.join("; ")}.`;
  });
  const insurance = summary ? [
    `Insurance: ${summary.payer} claim allowed ${formatDollars(summary.allowedCents)}; insurer paid ${formatDollars(summary.insurerPaidCents)}.`,
    `Patient responsibility per the claim: ${formatDollars(summary.patientResponsibilityCents)}. Patient paid: ${formatDollars(input.paidCents)}.`,
    ...(summary.possibleOverpaymentCents > 0 ? [`Possible overpayment: ${formatDollars(summary.possibleOverpaymentCents)}. Please confirm the balance and refund any amount paid above the patient's responsibility.`] : []),
  ] : [];
  return [
    `Medical Bill Guardian billing dispute for synthetic case ${input.caseLabel}. The patient authorized this request.`,
    `Invoice ${bill.invoiceId}, ${bill.provider}, service date ${bill.items[0]?.serviceDate ?? "unknown"}, billed ${formatDollars(bill.totalCents)}.`,
    ...(lines.length ? ["Charges we are asking you to review:", ...lines] : ["No individual charge is questioned."]),
    ...insurance,
    "Missing records or a price difference alone does not prove an error. Please reply with a corrected statement or supporting documentation.",
  ].join("\n");
}
