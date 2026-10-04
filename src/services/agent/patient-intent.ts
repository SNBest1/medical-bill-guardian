/** Conservative conversational intents. Explicit actions are checked against the pending case step before execution. */
export type PatientIntent = { kind: "approve" | "decline"; name?: string; action?: "request-bill" | "review" | "contact" } | { kind: "leave" } | { kind: "status" } | { kind: "refund"; name?: string } | null;

const APPROVE = "yes|y|yep|yeah|approve|approved|authorize|authorized|ok|okay|sure|go ahead|do it|go for it|confirm";
const DECLINE = "no|nope|stop|cancel|decline|don't|dont|hold off|not yet|never mind";
const STATUS = "status|update|any news|any update|where are we|how's it going|hows it going|what's happening|whats happening|what will you do|what am i approving|what do you need me to approve|why do you need my approval";

const phrase = (alternatives: string) => new RegExp(`^(?:${alternatives})(?:\\s+(?:for\\s+)?([a-z]+))?[.!]*$`);

export function classifyPatientReply(text: string): PatientIntent {
  const t = text.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
  if (!t || t.length > 240) return null;
  if (/^(?:i'm done|im done|i am done|done|exit|leave|leave (?:the |this )?investigation|stop (?:the |this )?investigation)[.!]*$/.test(t)) return { kind: "leave" };
  if (/^(?:refund|send (?:it|the (?:money|credit|refund)|my (?:money|refund))(?:(?: back)?(?: (?:now|right now))?)|send (?:the |my )?money back(?: (?:now|right now))?)[.!]*$/.test(t)) return { kind: "refund" };
  if (new RegExp(`^(?:${STATUS})[?.!]*$`).test(t)) return { kind: "status" };
  // Accept common conversational phrasing, without accepting conditions, extra instructions,
  // quoted approvals, questions or a different patient as implied authorization.
  const names = [...t.matchAll(/\b(morgan|harriet|theo)\b/g)].map((match) => match[1]);
  if (new Set(names).size > 1) return null;
  const name = names[0];
  const conversational = t.replace(/\b(morgan|harriet|theo)(?:'s)?\s*/g, "").replace(/[,!\.]/g, "").replace(/\s+/g, " ").trim();
  const action = /^(?:please )?(?:call (?:them|the hospital|hospital billing|billing)(?: and (?:ask about|review|check) (?:the )?(?:ecg|charge|bill|it|that charge))?|ask (?:them|the hospital|hospital billing|billing) (?:about|to review) (?:the )?(?:ecg|charge|bill|it|that charge)|review (?:the )?bill|(?:get|request) (?:the |an )?(?:itemized )?bill)(?: please)?$/;
  const positive = conversational.replace(new RegExp(`^(?:${APPROVE})(?: please)?(?: to)?\\s+`), "");
  if (action.test(positive)) {
    const scope = /^(?:please )?(?:get|request) /.test(positive) ? "request-bill" : /ecg|charge|review|check|ask about|to review/.test(positive) ? "review" : "contact";
    return { kind: "approve", ...(name ? { name } : {}), action: scope };
  }
  if (/^(?:yes|yep|yeah|sure|okay|ok)(?: please| go ahead| that sounds good| let's do it)$|^(?:that sounds good|sounds good|you can go ahead|please go ahead)$/.test(conversational)) return { kind: "approve", ...(name ? { name } : {}) };
  const negative = conversational.replace(/^(?:no|nope) (?=don't|do not|please|not|let's|i don't)/, "");
  if (/^(?:no thanks|no thank you|please hold off|don't call (?:them|the hospital|billing)(?: yet)?|do not call (?:them|the hospital|billing)(?: yet)?|not right now|let's wait|i don't want (?:you to call|to proceed))$/.test(negative)) return { kind: "decline", ...(name ? { name } : {}) };
  const approve = phrase(APPROVE).exec(t);
  if (approve) return { kind: "approve", ...(approve[1] ? { name: approve[1] } : {}) };
  const decline = phrase(DECLINE).exec(t);
  if (decline) return { kind: "decline", ...(decline[1] ? { name: decline[1] } : {}) };
  return null;
}
