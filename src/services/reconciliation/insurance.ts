import type { FinancialReview, InsuranceContext, ItemizedBill } from "../../types/domain";

const cents = (amount: number) => Math.round(amount * 100);
const same = (left: number, right: number) => cents(left) === cents(right);
export function validateInsurance(value: unknown): InsuranceContext {
  if (!value || typeof value !== "object") throw new Error("Insurance context is required");
  const context = value as InsuranceContext;
  if (!["SELF_PAY", "INSURED", "UNKNOWN"].includes(context.coverage) || !["IN_NETWORK", "OUT_OF_NETWORK", "UNKNOWN"].includes(context.network) || !["FINAL", "PENDING", "DENIED", "UNKNOWN"].includes(context.claimStatus)) throw new Error("Invalid insurance coverage, network, or claim status");
  if ([context.payer, context.plan].some((entry) => entry !== undefined && (typeof entry !== "string" || entry.length > 200))) throw new Error("Invalid payer or plan");
  if (context.eob !== undefined) {
    const eob = context.eob;
    if (!eob || typeof eob !== "object" || typeof eob.invoiceId !== "string" || !eob.invoiceId || !/^\d{4}-\d{2}-\d{2}$/.test(eob.serviceDate)) throw new Error("EOB needs an invoice and service date");
    const amounts = [eob.billedTotal, eob.allowedTotal, eob.contractualAdjustment, eob.insurerPaid, eob.otherPayerPaid, eob.deductible, eob.copay, eob.coinsurance, eob.noncovered, eob.patientResponsibility];
    if (!amounts.every((amount) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= 1e8 && Math.abs(amount * 100 - Math.round(amount * 100)) < .0001)) throw new Error("EOB amounts must be nonnegative dollar amounts with at most two decimals");
  }
  return context;
}

/** Use actual adjudicated benefit allocations, not a universal insurance formula. */
export function assessPatientBalance(bill: ItemizedBill, paid: number, insurance?: InsuranceContext): FinancialReview {
  if (!insurance || insurance.coverage === "UNKNOWN") return { status: "NEEDS_INFORMATION", reasons: ["Confirm insurance coverage, payer, plan, network status, and the matching Explanation of Benefits before estimating patient responsibility."] };
  if (insurance.coverage === "SELF_PAY") {
    if (bill.patientResponsibility === undefined) return { status: "NEEDS_INFORMATION", reasons: ["Obtain the self-pay balance after discounts and financial assistance; gross charges alone do not establish what the patient owes."] };
    return { status: paid > bill.patientResponsibility ? "REVIEW_REQUIRED" : "RECONCILED", expectedPatientResponsibility: bill.patientResponsibility, possibleExcessPayment: Math.max(0, (cents(paid) - cents(bill.patientResponsibility)) / 100), reasons: ["Self-pay balance supplied by the statement. Check cash discounts and financial assistance separately; a difference is not a confirmed refund."] };
  }
  if (insurance.claimStatus === "PENDING") return { status: "CLAIM_PENDING", reasons: ["Insurance has not finalized the claim. Do not treat gross charges as patient responsibility."] };
  if (insurance.claimStatus === "DENIED") return { status: "REVIEW_REQUIRED", reasons: ["Insurance denied this claim. A denial does not by itself make the patient liable for the full billed amount.", ...(insurance.eob ? [] : ["Obtain the denial notice (EOB) stating the reason and the patient's appeal rights before assessing any balance."]), "Confirm the denial reason, whether an appeal is in progress, and whether the provider may bill the patient while an appeal is pending."] };
  if (insurance.claimStatus !== "FINAL" || !insurance.eob || insurance.network === "UNKNOWN") return { status: "NEEDS_INFORMATION", reasons: ["A final, matching EOB and confirmed network status are needed. Coordination of benefits and out-of-network protections require individual review."] };
  validateInsurance(insurance);
  const eob = insurance.eob;
  const reasons: string[] = [];
  if (eob.invoiceId !== bill.invoiceId || bill.items.some((item) => item.serviceDate !== eob.serviceDate)) reasons.push("The EOB invoice or service date does not match this statement.");
  if (!same(eob.billedTotal, bill.total)) reasons.push("The EOB billed amount does not match the statement total.");
  if (!same(eob.patientResponsibility, eob.deductible + eob.copay + eob.coinsurance + eob.noncovered)) reasons.push("The EOB patient allocations do not reconcile with its patient responsibility.");
  if (!same(eob.allowedTotal, eob.insurerPaid + eob.otherPayerPaid + eob.deductible + eob.copay + eob.coinsurance)) reasons.push("Allowed amount does not reconcile with insurer, other-payer, and covered patient allocations. Request clarification of this EOB format.");
  if (!same(eob.billedTotal, eob.allowedTotal + eob.contractualAdjustment + eob.noncovered)) reasons.push("Gross charges, contractual adjustment, allowed amount, and noncovered charges do not reconcile. Request a detailed EOB.");
  if (reasons.length) return { status: "REVIEW_REQUIRED", reasons };
  const balanceMismatch = bill.patientResponsibility !== undefined && !same(bill.patientResponsibility, eob.patientResponsibility);
  const possibleExcessPayment = Math.max(0, (cents(paid) - cents(eob.patientResponsibility)) / 100);
  return { status: possibleExcessPayment > 0 || balanceMismatch || insurance.network === "OUT_OF_NETWORK" ? "REVIEW_REQUIRED" : "RECONCILED", expectedPatientResponsibility: eob.patientResponsibility, possibleExcessPayment, reasons: [...(balanceMismatch ? ["The provider statement's patient balance differs from the final EOB."] : []), "Uses final EOB allocations, including insurer/secondary payments, deductible, copay, coinsurance, and noncovered amounts. Confirm the bank payment was applied only to this invoice.", ...(insurance.network === "OUT_OF_NETWORK" ? ["Out-of-network billing and any applicable surprise-billing protections require separate review; this calculation does not establish legal liability."] : []), "Benefit limits and accumulators are reflected in the insurer's adjudication; this app does not independently verify them. Potential excess payment is not a confirmed refund."] };
}
