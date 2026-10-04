import type { ItemizedBill } from "../../types/domain";

export class BillParseError extends Error {}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const cents = (text: string) => Math.round(Number(text.replace(/,/g, "")) * 100);

/** "September 14, 2026" -> "2026-09-14"; null when it is not a real calendar date. */
export function longDateToIso(text: string): string | null {
  const match = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const month = MONTHS.findIndex((name) => name === match[1].toLowerCase() || name.slice(0, 3) === match[1].toLowerCase());
  if (month < 0) return null;
  const day = Number(match[2]), year = Number(match[3]);
  const probe = new Date(Date.UTC(year, month, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month || probe.getUTCDate() !== day) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const AMOUNT = String.raw`\$\s*([\d,]+\.\d{2})`;
const HEADING_NOISE = /^(itemized|statement|invoice|patient billing|account details|bill\b|page\b)/i;

/**
 * Tolerant parser for the text layer of a hospital's itemized-statement PDF. It reads the layout the
 * synthetic bills use (heading with the provider, "Invoice Number", "Patient <name>", "Service Date",
 * numbered charge rows with an optional billing code or a dash placeholder, adjustments, patient
 * responsibility, "Total charges") without relying on exact line breaks. It then validates what a
 * trustworthy bill must satisfy; anything less throws BillParseError so the caller can fail visibly.
 */
export function parsePdfBill(text: string): ItemizedBill {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length) throw new BillParseError("The PDF contained no text");
  const joined = lines.join("\n");

  const provider = lines.find((line) => !HEADING_NOISE.test(line) && /[A-Za-z]{3}/.test(line) && !/\$|^\d/.test(line));
  if (!provider) throw new BillParseError("Could not find the provider name at the top of the bill");

  const invoiceId = /Invoice\s*(?:Number|No\.?|#)\s*:?\s*([A-Z0-9][A-Z0-9-]{2,})/i.exec(joined)?.[1];
  if (!invoiceId) throw new BillParseError("Could not find an invoice number");

  const patientLine = lines.map((line) => /^Patient\s+(?!responsibility\b|billing\b)(.+?)(?:\s+Invoice\s+Number\b.*)?$/i.exec(line)?.[1]).find(Boolean);
  const patient = patientLine && /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,3}$/.test(patientLine) ? patientLine : undefined;

  const dateText = /Service\s+Date\s*:?\s*([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i.exec(joined)?.[1];
  const serviceDate = dateText ? longDateToIso(dateText) : null;
  if (!serviceDate) throw new BillParseError("Could not find a valid service date");

  const total = new RegExp(String.raw`^Total(?:\s+charges)?\s*:?\s*${AMOUNT}`, "im").exec(joined)?.[1];
  if (!total) throw new BillParseError("Could not find the total charges");
  const adjustments = new RegExp(String.raw`^Insurance\s+adjustments?\s*:?\s*-?${AMOUNT}`, "im").exec(joined)?.[1];
  const responsibility = new RegExp(String.raw`^Patient\s+responsibility\s*:?\s*${AMOUNT}`, "im").exec(joined)?.[1];

  // Charge rows: "<n> <description> [<code>|-|—] $<amount>", read only between the charges heading and the summary lines.
  const start = lines.findIndex((line) => /^itemized charges\b/i.test(line));
  const end = lines.findIndex((line, index) => index > start && /^(insurance\s+adjustments?|patient\s+responsibility|total)\b/i.test(line));
  const region = lines.slice(start < 0 ? 0 : start + 1, end < 0 ? lines.length : end);
  const row = new RegExp(String.raw`^(\d{1,3})\.?\s+(.+?)(?:\s+([A-Z]?\d{4,5}[A-Z]?)|\s+[—–-])?\s+${AMOUNT}$`);
  const items = region.flatMap((line) => {
    const match = row.exec(line);
    return match ? [{ description: match[2].trim(), code: match[3], amount: Number(match[4].replace(/,/g, "")) }] : [];
  }).map((item, index) => ({ id: `bill-${index + 1}`, description: item.description, code: item.code, amount: item.amount, serviceDate }));
  if (!items.length) throw new BillParseError("Could not find any itemized charge rows");

  const sum = items.reduce((acc, item) => acc + Math.round(item.amount * 100), 0);
  if (sum !== cents(total)) throw new BillParseError(`Charges add up to $${(sum / 100).toFixed(2)} but the bill states $${total}`);

  return {
    invoiceId, provider, patient, total: cents(total) / 100,
    patientResponsibility: responsibility ? cents(responsibility) / 100 : undefined,
    insuranceAdjustments: adjustments ? cents(adjustments) / 100 : undefined,
    items
  };
}
