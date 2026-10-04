import { extractTextItems, type StructuredTextItem } from "unpdf";

/**
 * Rebuilds reading-order lines from one page's positioned fragments. PDF generators split lines into
 * pieces and emit them in any order; y is bottom-up, so a larger y is higher on the page.
 */
export function groupIntoLines(items: StructuredTextItem[]): string[] {
  const lines: StructuredTextItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= Math.max(1, item.fontSize * 0.3));
    if (line) line.push(item); else lines.push([item]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x).reduce((text, item, index) => {
    if (index === 0) return item.str;
    const previous = line[index - 1];
    // A visible gap is a space; touching fragments are one word split in two.
    return text + (item.x - (previous.x + previous.width) > item.fontSize * 0.15 ? " " : "") + item.str;
  }, "").trim()).filter(Boolean);
}

/** All pages' text as newline-separated lines, bounded by page count. */
export async function pdfLines(bytes: Uint8Array, maxPages: number): Promise<string> {
  const { totalPages, items } = await extractTextItems(bytes.slice());
  if (totalPages > maxPages) throw new Error("PDF has too many pages");
  return items.flatMap((page) => groupIntoLines(page.filter((item) => item.str.trim()))).join("\n");
}
