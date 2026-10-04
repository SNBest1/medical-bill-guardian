import PostalMime from "postal-mime";
import { pdfLines } from "./pdf-text";
import { fetchLinkedPdf, linkedPdfUrl, type LinkOptions } from "./pdf-link";
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

/** Validated statement text from PDF bytes, or undefined (image-only, malformed, or off-contract). */
async function statementFromPdf(bytes: Uint8Array): Promise<string | undefined> {
  if (bytes.byteLength > MAX_PDF_BYTES || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") { console.warn(`PDF not used: ${bytes.byteLength} bytes, header ${JSON.stringify(new TextDecoder().decode(bytes.slice(0, 5)))}`); return undefined; }
  try {
    const statement = (await pdfLines(bytes, MAX_PDF_PAGES)).trim();
    if (!statement || statement.length > MAX_TEXT_CHARS) return undefined;
    const bill = parseItemizedBill(statement);
    if (bill.items.reduce((sum, item) => sum + item.amountCents, 0) !== bill.totalCents) return undefined;
    return statement;
  } catch (error) {
    // Image-only (scanned) or malformed PDFs stay pending for manual review; there is no OCR.
    console.warn(`PDF not used: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
    return undefined;
  }
}

/** Reads bounded MIME content and extracts a validated statement from one PDF attachment or one allowed PDF link. */
export async function parseProviderReply(message: InboundMessage, links: LinkOptions = {}): Promise<ParsedProviderReply | null> {
  if (message.to.toLowerCase() !== "ai@nipunsaini.com" || message.rawSize > MAX_EMAIL_BYTES) return null;
  const messageId = message.headers.get("message-id")?.trim();
  const caseId = caseIdFromSubject(message.headers.get("subject") ?? "");
  if (!messageId || messageId.length > 512 || !caseId) return null;
  const raw = await new Response(message.raw).arrayBuffer();
  if (raw.byteLength > MAX_EMAIL_BYTES) return null;
  const email = await PostalMime.parse(raw);
  const body = (email.text ?? "").slice(0, MAX_TEXT_CHARS).trim();
  console.log(`reply attachments: ${email.attachments.map((attachment) => `${attachment.mimeType}${attachment.filename ? ` (${attachment.filename.slice(-40)})` : ""}`).join(", ") || "none"}`);
  const pdfs = email.attachments.filter((attachment) =>
    attachment.mimeType === "application/pdf" || attachment.filename?.toLowerCase().endsWith(".pdf"),
  );
  if (pdfs.length === 1 && typeof pdfs[0].content !== "string") {
    const statement = await statementFromPdf(new Uint8Array(pdfs[0].content));
    return statement ? { caseId, messageId, body, statement } : { caseId, messageId, body };
  }
  if (pdfs.length > 1) return { caseId, messageId, body };
  // No attachment: a reply may instead link the PDF, but only on an operator-allowed host.
  const url = linkedPdfUrl(body, links.allowedHosts ?? []);
  if (!url) return { caseId, messageId, body };
  try {
    const statement = await statementFromPdf(await fetchLinkedPdf(url, { ...links, maxBytes: MAX_PDF_BYTES }));
    return statement ? { caseId, messageId, body, statement } : { caseId, messageId, body };
  } catch (error) {
    console.warn(`linked PDF not used: ${error instanceof Error ? error.message : String(error)}`);
    return { caseId, messageId, body };
  }
}
