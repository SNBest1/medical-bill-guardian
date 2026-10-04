import PostalMime from "postal-mime";
import { extractText, getDocumentProxy } from "unpdf";
import { parseItemizedBill } from "../spacetimedb/src/logic/parse-bill";
import type { InboundMessage } from "./types";

const MAX_EMAIL_BYTES = 6_000_000;
const MAX_PDF_BYTES = 4_000_000;
const MAX_PDF_PAGES = 30;
const MAX_TEXT_CHARS = 100_000;
const CASE_MARKER = /\[CASE-([1-9]\d*)\]/g;

export interface ParsedProviderReply {
  caseId: string;
  messageId: string;
  body: string;
  statement?: string;
}

/** Extracts a single case ID from the reply subject; ambiguous subjects are ignored. */
export function caseIdFromSubject(subject: string): string | null {
  const matches = [...subject.matchAll(CASE_MARKER)].map((match) => match[1]);
  return matches.length === 1 ? matches[0] : null;
}

/** Reads bounded MIME content and extracts a validated text PDF statement if present. */
export async function parseProviderReply(message: InboundMessage): Promise<ParsedProviderReply | null> {
  if (message.to.toLowerCase() !== "ai@nipunsaini.com" || message.rawSize > MAX_EMAIL_BYTES) return null;
  const messageId = message.headers.get("message-id")?.trim();
  const caseId = caseIdFromSubject(message.headers.get("subject") ?? "");
  if (!messageId || messageId.length > 512 || !caseId) return null;
  const raw = await new Response(message.raw).arrayBuffer();
  if (raw.byteLength > MAX_EMAIL_BYTES) return null;
  const email = await PostalMime.parse(raw);
  const body = (email.text ?? "").slice(0, MAX_TEXT_CHARS).trim();
  const pdfs = email.attachments.filter((attachment) =>
    attachment.mimeType === "application/pdf" || attachment.filename?.toLowerCase().endsWith(".pdf"),
  );
  if (pdfs.length !== 1) return { caseId, messageId, body };
  if (typeof pdfs[0].content === "string") return { caseId, messageId, body };
  const bytes = new Uint8Array(pdfs[0].content);
  if (bytes.byteLength > MAX_PDF_BYTES || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return { caseId, messageId, body };
  try {
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > MAX_PDF_PAGES) return { caseId, messageId, body };
    const extracted = await extractText(pdf, { mergePages: true });
    const statement = typeof extracted.text === "string" ? extracted.text.trim() : "";
    if (statement.length > MAX_TEXT_CHARS) return { caseId, messageId, body };
    const bill = parseItemizedBill(statement);
    if (bill.items.reduce((sum, item) => sum + item.amountCents, 0) !== bill.totalCents) return { caseId, messageId, body };
    return { caseId, messageId, body, statement };
  } catch {
    // Image-only or malformed PDFs stay pending for manual review.
    return { caseId, messageId, body };
  }
}
