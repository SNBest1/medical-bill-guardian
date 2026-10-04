export interface CallTranscriptTurn {
  role: "agent" | "user";
  message: string;
}

export type CallOutcome = "CONFIRMED" | "NOT_CONFIRMED";

const CONFIRMATION = /\bwill remove\b.*\bseven hundred\b|\bseven hundred dollars?\b.*\bremove(d)?\b/i;

/** A correction is confirmed only when the billing side says so in the transcript. A connected call alone is not enough. */
export function classifyCallOutcome(turns: CallTranscriptTurn[]): CallOutcome {
  const billingDeskSpoke = turns.some((turn) => turn.role === "user");
  const confirmed = turns.some((turn) => turn.role === "user" && CONFIRMATION.test(turn.message));
  return billingDeskSpoke && confirmed ? "CONFIRMED" : "NOT_CONFIRMED";
}
