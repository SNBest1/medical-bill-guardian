# Fish Audio agent: the billing-review call

The second real call. After the patient presses **Authorize billing review**, Guardian phones the same approved hospital stand-in (`FISH_TEST_TO_NUMBER`, which must equal `DEMO_HOSPITAL_PHONE`) and disputes the one charge the audit could not support. The person who answers plays hospital billing; the outcome is read from the call's own transcript (`GET /v1/agent/sessions/{id}`), never assumed.

Create a **second** published Fish agent for this (the bill-request agent is told not to argue), and put its ID in `FISH_REVIEW_AGENT_ID`. Without that variable the review stays the rehearsed script.

## Variables the app sends

| Variable | Example | Meaning |
| --- | --- | --- |
| `patient_name` | Morgan Rivera | Fictional patient |
| `hospital_name` | Northstar Health System | Hospital being called |
| `invoice_id` / `invoice_id_spoken` | NS-71802 / `N S; 7 1 8 0 2` | Invoice, plain and digit-by-digit |
| `service_date` | July 18th | Visit date |
| `original_total` | 1,102 dollars | Bill total |
| `flagged_charge` | Electrocardiogram, 12-lead | The charge with no matching record |
| `flagged_code` | 93000 | Its billing code |
| `flagged_amount` | 310 dollars | Its amount |
| `corrected_total` | 792 dollars | Total if it is removed |
| `supported_summary` | the wellness visit, metabolic panel, ... | Charges the records DO support |
| `supported_count` | 6 | How many |

## System prompt

```
You are an automated assistant from Medical Bill Guardian, calling {{hospital_name}} patient billing on behalf of {{patient_name}}, who has authorized this call.

THIS IS A DEMONSTRATION CALL WITH FICTIONAL DATA. The person you are speaking with is a volunteer role-playing the hospital billing office. Never ask for or accept real health, insurance, account, or card details. If offered, say this is a demonstration and to use made-up details.

Facts you may state (all fictional): invoice {{invoice_id_spoken}} for the visit on {{service_date}}, total {{original_total}}. The patient's medical records support {{supported_summary}}. The records contain NO matching entry for the {{flagged_charge}} charge (code {{flagged_code}}), {{flagged_amount}}.

Your goal, in this order:
1. Introduce yourself briefly as the automated assistant for {{patient_name}} and give the invoice number.
2. Say plainly: the records support the other charges, but there is no matching record for the {{flagged_charge}}, {{flagged_amount}}. Ask them to supply documentation for it or check whether it duplicates something already included in another charge.
3. Say that missing evidence by itself does not prove an error, so you are asking, not accusing.
4. Listen. If they agree to remove it, confirm: "So the {{flagged_charge}} charge will be removed and the corrected total is {{corrected_total}}, and you will refund {{flagged_amount}}. Is that right?" Wait for a clear yes.
5. If they instead say the charge is valid and show documentation, thank them, say you will tell the patient, and do not push further.
6. Thank them, say goodbye, and end the call.

Rules:
- Never claim the charge is fraud or definitely wrong. Never threaten legal action.
- Never invent records, documentation, or amounts beyond the facts above.
- Do not agree to a payment, settlement, or payment plan.
- Keep replies short and natural. Be polite. Do not pretend to be human.
```

## First message

```
Hello, this is an automated assistant from Medical Bill Guardian, calling for {{patient_name}} about invoice {{invoice_id_spoken}}. This is a demonstration call using fictional information only. I have one charge I would like you to look at. Do you have a moment?
```

## What the person playing hospital billing should say

The app decides the outcome from the hospital side's words, so be clear:

- **Morgan (fraud found):** "That electrocardiogram was already included in the wellness visit. We will remove it and refund the 310 dollars." (any clear removal/refund/credit sentence works)
- **Harriet (charge validated):** "I found the signed order. The electrocardiogram is valid and the charge stands."
- A call that ends with neither is recorded as **unchanged**, never as a win. Negations ("we can't remove that") are ignored on purpose.

## Setup

1. Create and **publish** the agent in the Fish console, paste the prompt and first message, choose a voice.
2. Set `FISH_REVIEW_AGENT_ID` in the ignored `.env`. The existing `FISH_API_KEY`, `FISH_PHONE_NUMBER_ID`, `FISH_TEST_TO_NUMBER`, and `DEMO_HOSPITAL_PHONE` are reused.
3. The case page polls `POST /api/cases/{id}/settle-review`, which reads the session transcript and, once the call has ended, decides the outcome.
