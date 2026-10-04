import type { Scenario } from "../scenarios";
export interface CallTurn { speaker: "Guardian" | "Billing representative"; text: string }

/** Rehearsable fictional conversations; these never dial a provider. */
export const billRequestCall: CallTurn[] = [
  { speaker: "Guardian", text: "Hello. This is Medical Bill Guardian, an automated billing assistant. In this simulation, the patient has authorized us to request an itemized statement for their University Hospital payment." },
  { speaker: "Billing representative", text: "This is the simulated billing desk. Which invoice are you reviewing?" },
  { speaker: "Guardian", text: "Invoice U H 48291, for the September twenty eighth visit. The payment was four thousand eight hundred twenty dollars. Please include the service dates, codes, individual charges, and adjustments." },
  { speaker: "Billing representative", text: "I will send the six itemized charges through the demo statement inbox. You can compare those with the available records." },
];

export const billingReviewCall: CallTurn[] = [
  { speaker: "Guardian", text: "Hello. This is Medical Bill Guardian, the patient's authorized automated billing assistant in this simulation. We are reviewing invoice U H 48291, already paid at four thousand eight hundred twenty dollars." },
  { speaker: "Billing representative", text: "I have the statement. Which charge would you like us to verify?" },
  { speaker: "Guardian", text: "The seven hundred dollar specialist consultation. The available records support the emergency visit, imaging, sutures, and medication, but contain no matching specialist encounter. Missing evidence alone does not prove an error. Can you supply documentation or check whether this was included in the emergency charge?" },
  { speaker: "Billing representative", text: "I checked the simulated invoice. That consultation duplicated services included in the emergency room charge. We will remove the seven hundred dollars." },
  { speaker: "Guardian", text: "That makes the corrected total four thousand one hundred twenty dollars. Since the patient already paid, please confirm a seven hundred dollar refund, rather than another payment." },
  { speaker: "Billing representative", text: "Confirmed. In this demo we will issue a written correction and mark the seven hundred dollar refund as pending." },
  { speaker: "Guardian", text: "Thank you. We will tell the patient what changed and keep the refund pending until a credit is verified. We will not claim money has arrived yet." },
];

export const insuredBillingReviewCall: CallTurn[] = [
  ...billingReviewCall.slice(0, 4),
  { speaker: "Guardian", text: "Please issue the corrected statement and submit the adjustment to the insurer. A seven hundred dollar reduction in gross charges does not mean the patient gets seven hundred dollars back. We need the revised Explanation of Benefits, patient balance, and payment allocation." },
  { speaker: "Billing representative", text: "In this simulation, we will issue the corrected statement and request insurance reprocessing. The patient's refund amount is not confirmed yet." },
  { speaker: "Guardian", text: "We will notify the patient about the confirmed billing correction and track the revised insurance outcome before claiming a refund." },
];

const dollars = (amount: number) => `$${amount.toLocaleString()}`;
const flaggedAmount = (scenario: Scenario) => Number(scenario.statement.split("\n").find((line) => line.startsWith(`${scenario.outcome.flagged} |`))?.split("|")[2]);
const invoiceOf = (scenario: Scenario) => scenario.statement.match(/^Invoice: (.+)$/m)?.[1] ?? "";
const chargeCount = (scenario: Scenario) => scenario.statement.split("\n").filter((line) => line.split("|").length === 3).length;

/** The itemized-statement request for a scenario; the original case keeps its rehearsed script. */
export function billRequestTurns(scenario: Scenario): CallTurn[] {
  if (scenario.id === "university-er") return billRequestCall;
  const { transaction, hospital } = scenario;
  return [
    { speaker: "Guardian", text: `Hello. This is Medical Bill Guardian, an automated billing assistant. In this simulation, the patient has authorized us to request an itemized statement for their ${hospital.name} payment.` },
    { speaker: "Billing representative", text: "This is the simulated billing desk. Which invoice are you reviewing?" },
    { speaker: "Guardian", text: `Invoice ${invoiceOf(scenario)}, for the visit on ${transaction.date}. The payment was ${dollars(transaction.amount)}. Please include the service dates, codes, individual charges, and adjustments.` },
    { speaker: "Billing representative", text: `I will send the ${chargeCount(scenario)} itemized charges through the demo statement inbox. You can compare those with the available records.` }
  ];
}

/** The review conversation after the patient authorizes it, matching the scenario's expected hospital reply. */
export function billingReviewTurns(scenario: Scenario, insured = false): CallTurn[] {
  if (scenario.id === "university-er") return insured ? insuredBillingReviewCall : billingReviewCall;
  const { transaction, hospital, outcome } = scenario;
  const amount = flaggedAmount(scenario);
  const opening: CallTurn[] = [
    { speaker: "Guardian", text: `Hello. This is Medical Bill Guardian, the patient's authorized automated billing assistant in this simulation. We are reviewing invoice ${invoiceOf(scenario)} from ${hospital.name}, already paid at ${dollars(transaction.amount)}.` },
    { speaker: "Billing representative", text: "I have the statement. Which charge would you like us to verify?" },
    { speaker: "Guardian", text: `The ${dollars(amount)} ${outcome.flagged}. The available records support the other charges, but contain no matching entry for this one. Missing evidence alone does not prove an error, so we are asking you to check.` }
  ];
  if (outcome.result === "CHARGE_VERIFIED") return [
    ...opening,
    { speaker: "Billing representative", text: `I checked the simulated invoice. ${outcome.explanation}` },
    { speaker: "Guardian", text: `Understood. The total stays at ${dollars(transaction.amount)} and no refund is owed. Thank you for confirming.` },
    { speaker: "Billing representative", text: "Confirmed. In this demo we will send a written confirmation that the charge stands." }
  ];
  return [
    ...opening,
    { speaker: "Billing representative", text: `I checked the simulated invoice. ${outcome.explanation}` },
    { speaker: "Guardian", text: `That makes the corrected total ${dollars(transaction.amount - amount)}. Since the patient already paid, please confirm a ${dollars(amount)} refund, rather than another payment.` },
    { speaker: "Billing representative", text: `Confirmed. In this demo we will issue a written correction and mark the ${dollars(amount)} refund as pending.` },
    { speaker: "Guardian", text: "Thank you. We will tell the patient what changed and keep the refund pending until a credit is verified. We will not claim money has arrived yet." }
  ];
}
