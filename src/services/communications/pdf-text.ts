import { extractText, getDocumentProxy } from "unpdf";

export class PdfReadError extends Error {}
export const MAX_PDF_PAGES = 20;

/** Extracts the text layer of a PDF (no OCR). Scanned images yield no text and are reported as unreadable. */
export async function extractPdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  try {
    const document = await getDocumentProxy(new Uint8Array(bytes));
    if (document.numPages > MAX_PDF_PAGES) throw new PdfReadError(`The PDF has ${document.numPages} pages; the limit is ${MAX_PDF_PAGES}`);
    const { totalPages, text } = await extractText(document, { mergePages: true });
    if (!text.trim()) throw new PdfReadError("The PDF has no readable text layer");
    return { pages: totalPages, text };
  } catch (error) {
    if (error instanceof PdfReadError) throw error;
    throw new PdfReadError("The file could not be read as a PDF");
  }
}
