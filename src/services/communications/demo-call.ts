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
