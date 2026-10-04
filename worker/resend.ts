import type { Env } from "./types";

const RECIPIENT = "nipun.saini9@gmail.com";
const REPLY_TO = "ai@nipunsaini.com";

export type EmailKind = "EMAIL_ITEMIZED_BILL_REQUEST" | "EMAIL_BILLING_REVIEW";

export interface OutboundEmail {
  caseId: string;
  kind: EmailKind;
  merchant: string;
  paidOn: string;
  invoiceId?: string;
  questionedCharge?: string;
  /** Letter composed and stored by the module (the cited dispute); used as the review email's text. */
  body?: string;
}

/** Builds a minimal, stable provider request from authorized case facts. */
export function draftProviderEmail(input: OutboundEmail) {
  const marker = `[CASE-${input.caseId}]`;
  if (input.kind === "EMAIL_ITEMIZED_BILL_REQUEST") {
    return {
      subject: `${marker} Itemized statement request`,
      text: `Please provide the itemized statement for the ${input.merchant} payment dated ${input.paidOn}. Include service dates, descriptions, codes if available, charges, insurance adjustments, and patient responsibility. Please reply with the statement as a PDF attachment. Reference ${marker} in your reply.`,
    };
  }
  if (input.body) return { subject: `${marker} Billing dispute`, text: `${input.body}\n\nReference ${marker} in your reply.` };
  return {
    subject: `${marker} Billing review request`,
    text: `Please review invoice ${input.invoiceId ?? "on file"} for the ${input.merchant} visit dated ${input.paidOn}. The available patient-authorized record did not verify the ${input.questionedCharge ?? "questioned"} charge. Please provide supporting documentation or a corrected statement. This request does not assert that the charge is invalid. Reference ${marker} in your reply.`,
  };
}

/** Sends one authorized message through Resend with a stable retry key. */
export async function sendProviderEmail(env: Env, input: OutboundEmail, fetcher: typeof fetch = fetch): Promise<string> {
  if (env.EMAIL_SEND_ENABLED !== "true" || !env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) throw new Error("Live email sending is not configured");
  if (!/^[1-9]\d*$/.test(input.caseId)) throw new Error("Invalid case ID");
  const { subject, text } = draftProviderEmail(input);
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `medical-bill-guardian/${input.caseId}/${input.kind}`,
      // Resend sits behind Cloudflare, whose bot filter rejects clients without a User-Agent (error 1010).
      "User-Agent": "medical-bill-guardian/1.0",
    },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [RECIPIENT], reply_to: REPLY_TO, subject, text }),
  });
  if (!response.ok) {
    const detail = await response.json().then((body: { message?: string }) => body.message).catch(() => undefined);
    throw new Error(`Resend send failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Resend did not return an email ID");
  return result.id;
}
