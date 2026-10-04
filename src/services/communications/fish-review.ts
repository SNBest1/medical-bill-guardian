import { createHash } from "node:crypto";
import type { Finding, ItemizedBill, Resolution } from "../../types/domain";
import { MAX_VARIABLE_LENGTH, spokenDate, type FishDynamicVariables } from "./fish-call";
import { scenarioForProvider } from "../scenarios";

/** Stable per demo run and destination, like the bill-request key but scoped to the billing review. */
export function reviewCallIdempotencyKey(caseId: string, attemptId: string, toNumber: string) {
  const fingerprint = createHash("sha256").update(`${attemptId}\0${toNumber.trim()}`).digest("hex").slice(0, 16);
  return `medical-bill-guardian:${caseId}:billing-review:${fingerprint}`;
}

const cap = (value: string) => value.length > MAX_VARIABLE_LENGTH ? value.slice(0, MAX_VARIABLE_LENGTH) : value;
const dollars = (amount: number) => `${amount.toLocaleString("en-US")} ${amount === 1 ? "dollar" : "dollars"}`;
/** "NS-71802" -> "N S; 7 1 8 0 2" so the voice reads an invoice number digit by digit. */
export const spokenInvoice = (invoiceId: string) => invoiceId.split("-").map((part) => part.split("").join(" ")).join("; ");

const listed = (names: string[]) => names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;

/**
 * Per-call variables for the published review agent. Everything is derived from the case's own
 * bill and findings, so the voice can only state what the audit found: which charge has no
 * supporting record and what the records do support. It never states that the charge is wrong.
 */
export function buildReviewVariables(providerName: string, bill: ItemizedBill, findings: Finding[], scenarioId?: string): FishDynamicVariables {
  const scenario = scenarioForProvider(providerName, scenarioId);
  if (!scenario) throw new Error(scenarioId ? `no demo scenario ${scenarioId} for ${providerName}` : `no single demo scenario for ${providerName}; the case must say which patient`);
  const questioned = findings.filter((finding) => finding.action === "REQUEST_REVIEW");
  if (!questioned.length) throw new Error("There is no questioned charge to review");
  const target = questioned[0];
  const supported = findings.filter((finding) => finding.clinicalStatus === "SUPPORTED").map((finding) => finding.description);
  const item = bill.items.find((candidate) => candidate.id === target.billItemId);
  const variables: FishDynamicVariables = {
    patient_name: `${scenario.patient.firstName} ${scenario.patient.lastName}`,
    hospital_name: scenario.hospital.name,
    invoice_id: bill.invoiceId,
    invoice_id_spoken: spokenInvoice(bill.invoiceId),
    service_date: spokenDate(item?.serviceDate ?? scenario.transaction.date),
    original_total: dollars(bill.total),
    flagged_charge: target.description,
    flagged_code: item?.code ?? "",
    flagged_amount: dollars(target.amount),
    corrected_total: dollars(bill.total - target.amount),
    supported_summary: listed(supported.slice(0, 4)),
    supported_count: String(supported.length),
  };
  for (const [name, value] of Object.entries(variables)) variables[name] = cap(value);
  return variables;
}

/** Plain-language brief for the authorization panel: what the second call will say and ask. */
export function reviewBrief(variables: FishDynamicVariables): string[] {
  return [
    `Introduces itself as the automated assistant for ${variables.patient_name}, calling about invoice ${variables.invoice_id}.`,
    `Says the records support ${variables.supported_summary || "the other charges"}, but contain nothing for the ${variables.flagged_amount} ${variables.flagged_charge} charge.`,
    "Says missing evidence is not proof of an error, and asks billing to supply documentation or check for a duplicate.",
    `If they agree to remove it, confirms the corrected total of ${variables.corrected_total} and asks them to confirm a refund of ${variables.flagged_amount}.`,
    "Agrees to nothing on the patient's behalf, shares no real details, and ends politely.",
  ];
}

export interface FishSessionItem { type?: string; role?: string; content?: string }
export interface FishSession { status: string; endReason?: string; items: FishSessionItem[] }

/** Reads one Fish session. The transcript is only fetched on demand; webhooks never carry it. */
export async function fetchFishSession(sessionId: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<FishSession> {
  const response = await fetcher(`https://api.fish.audio/v1/agent/sessions/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Fish Audio session lookup failed with HTTP ${response.status}`);
  const body = await response.json() as { status?: unknown; end_reason?: unknown; items?: unknown };
  const items = Array.isArray(body.items) ? body.items.filter((item): item is FishSessionItem => typeof item === "object" && item !== null) : [];
  return { status: typeof body.status === "string" ? body.status : "unknown", endReason: typeof body.end_reason === "string" ? body.end_reason : undefined, items };
}

export const TERMINAL_STATUSES = ["completed", "failed"];
export const isTerminal = (session: FishSession) => TERMINAL_STATUSES.includes(session.status);

/** "Guardian: ...\nBilling representative: ..." from the message items, in call order. */
export function transcriptOf(session: FishSession): string {
  return session.items
    .filter((item) => item.type === "message" && typeof item.content === "string" && item.content.trim())
    .map((item) => `${item.role === "user" ? "Billing representative" : "Guardian"}: ${item.content!.trim()}`)
    .join("\n");
}

export type ReviewOutcome = "REMOVED" | "VERIFIED" | "INCONCLUSIVE";

const NEGATION = /\b(not|no|never|cannot|can't|cant|won't|wont|wouldn't|unable|isn't|wasn't|don't|didn't|aren't|haven't)\b|n't/i;
const REMOVAL = /\b(remov(e|ed|ing)|waiv(e|ed|ing)|credit(ed|ing)?|refund(ed|ing)?|revers(e|ed|ing)|(included|added|charged|billed) (by mistake|in error|accidentally)|billing (mistake|error)|take (it|that|this) off|taking (it|that|this) off|duplicat(e|ed)|adjust(ed|ing)?)\b/i;
const VERIFICATION = /\b(valid|legitimate|documented|documentation|signed order|on file|located|found (it|the|a)|stands?|will stand|justified|was performed|was done|correct charge)\b/i;

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);

/**
 * Decides what the hospital side said, from its own turns only (the agent's words never count).
 * A removal needs an affirmative sentence about removing, crediting, refunding, or duplication;
 * a verification needs an affirmative sentence that supports the charge. A negated sentence counts
 * for nothing, so "we can't remove that" is never read as a concession. Anything else is
 * INCONCLUSIVE, which the app reports as unchanged, never as a win.
 */
export function classifyReviewCall(session: FishSession): ReviewOutcome {
  // A short confirmation counts only immediately after the agent explicitly confirms
  // a removal/refund. Agreement with a request to check records is not a concession.
  const messages = session.items.filter((item) => item.type === "message" && typeof item.content === "string");
  const confirmedRemoval = messages.some((item, index) => {
    const previous = messages[index - 1];
    return item.role === "user" && /^(yeah[,.]?\s*)?(yes|yeah|correct|that['’]s correct|that is correct|confirmed|exactly)[.!]?$/i.test(item.content!.trim())
      && previous?.role === "assistant" && /\b(confirm|is that right)\b/i.test(previous.content!)
      && /\b(will be removed|will be issued|will refund|will remove|corrected total)\b/i.test(previous.content!)
      && REMOVAL.test(previous.content!) && !NEGATION.test(previous.content!);
  });
  const spoken = session.items.filter((item) => item.type === "message" && item.role === "user" && typeof item.content === "string").flatMap((item) => sentences(item.content!));
  if (!spoken.length) return "INCONCLUSIVE";
  const affirmative = spoken.filter((sentence) => !NEGATION.test(sentence));
  if (confirmedRemoval || affirmative.some((sentence) => REMOVAL.test(sentence))) return "REMOVED";
  if (affirmative.some((sentence) => VERIFICATION.test(sentence))) return "VERIFIED";
  return "INCONCLUSIVE";
}

/** Turns a finished call into the case's resolution. Amounts come from the bill, never from speech. */
export function resolutionFromCall(outcome: ReviewOutcome, bill: ItemizedBill, flaggedDescription: string, flaggedAmount: number): Resolution {
  const money = `$${flaggedAmount.toLocaleString()}`;
  if (outcome === "REMOVED") return { result: "DUPLICATE_REMOVED", originalTotal: bill.total, correctedTotal: bill.total - flaggedAmount, adjustment: flaggedAmount, explanation: `On a live call, hospital billing agreed to remove the ${money} ${flaggedDescription} charge.` };
  if (outcome === "VERIFIED") return { result: "CHARGE_VERIFIED", originalTotal: bill.total, correctedTotal: bill.total, adjustment: 0, explanation: `On a live call, hospital billing said the ${money} ${flaggedDescription} charge is supported and stands. No change to the bill.` };
  return { result: "UNRESOLVED", originalTotal: bill.total, correctedTotal: bill.total, adjustment: 0, explanation: `The call ended without hospital billing confirming a change to the ${money} ${flaggedDescription} charge. The bill is unchanged and the charge is still under question.` };
}
