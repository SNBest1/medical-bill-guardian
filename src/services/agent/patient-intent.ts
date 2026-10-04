/** What a patient's short reply means. Exact short phrases only: anything else is treated as a new request, never as an approval. */
export type PatientIntent = { kind: "approve" | "decline"; name?: string } | { kind: "leave" } | { kind: "status" } | { kind: "refund"; name?: string } | null;

const APPROVE = "yes|y|yep|yeah|approve|approved|authorize|authorized|ok|okay|sure|go ahead|do it|go for it|confirm";
const DECLINE = "no|nope|stop|cancel|decline|don't|dont|hold off|not yet|never mind";
const STATUS = "status|update|any news|any update|where are we|how's it going|hows it going|what's happening|whats happening";

const phrase = (alternatives: string) => new RegExp(`^(?:${alternatives})(?:\\s+(?:for\\s+)?([a-z]+))?[.!]*$`);

export function classifyPatientReply(text: string): PatientIntent {
  const t = text.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
  if (!t || t.length > 80) return null;
  if (/^(?:i'm done|im done|i am done|done|exit|leave|leave (?:the |this )?investigation|stop (?:the |this )?investigation)[.!]*$/.test(t)) return { kind: "leave" };
  if (/^(?:refund|send (?:it|the (?:money|credit|refund)|my (?:money|refund))(?:(?: back)?(?: (?:now|right now))?)|send (?:the |my )?money back(?: (?:now|right now))?)[.!]*$/.test(t)) return { kind: "refund" };
  if (new RegExp(`^(?:${STATUS})[?.!]*$`).test(t)) return { kind: "status" };
  const approve = phrase(APPROVE).exec(t);
  if (approve) return { kind: "approve", ...(approve[1] ? { name: approve[1] } : {}) };
  const decline = phrase(DECLINE).exec(t);
  if (decline) return { kind: "decline", ...(decline[1] ? { name: decline[1] } : {}) };
  return null;
}
