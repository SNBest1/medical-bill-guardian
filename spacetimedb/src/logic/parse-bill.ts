import { toCents } from "./money";
import type { BillLine, Component, ParsedBill, Setting } from "./types";

const AMOUNT = /^\d+(?:\.\d{2})?$/;
const SETTINGS: Setting[] = ["INPATIENT", "OUTPATIENT"];
const COMPONENTS: Component[] = ["FACILITY", "PROFESSIONAL", "GLOBAL"];

/**
 * Parses a statement: header fields, an optional "Setting:" line, then "Charges" lines of either
 * "description | code | amount" or "description | code | component | units | amount" ("-" = no code).
 * Setting, component, and units are what published rates are matched on.
 */
export function parseItemizedBill(statement: string): ParsedBill {
  const lines = statement.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const field = (name: string) => lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2).trim();
  const invoiceId = field("Invoice");
  const provider = field("Provider");
  const serviceDate = field("Service date") ?? "";
  const totalText = field("Total") ?? "";
  const settingText = field("Setting");
  const start = lines.indexOf("Charges");
  const end = lines.findIndex((line) => line.startsWith("Total: "));
  if (!invoiceId || !provider || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !AMOUNT.test(totalText) || start < 0 || end <= start + 1) throw new Error("Itemized statement is missing required bill fields or total");
  if (settingText !== undefined && !SETTINGS.includes(settingText as Setting)) throw new Error("Setting must be INPATIENT or OUTPATIENT");
  const setting = settingText as Setting | undefined;
  const items = lines.slice(start + 1, end).map((line, index): BillLine => {
    const parts = line.split("|").map((part) => part.trim());
    const n = index + 1;
    if ((parts.length !== 3 && parts.length !== 5) || !parts[0] || !AMOUNT.test(parts[parts.length - 1])) throw new Error(`Invalid itemized charge on line ${n}`);
    const item: BillLine = { description: parts[0], code: parts[1] === "-" || !parts[1] ? undefined : parts[1], amountCents: toCents(parts[parts.length - 1]), serviceDate, setting };
    if (parts.length === 5) {
      if (!COMPONENTS.includes(parts[2] as Component)) throw new Error(`Invalid component on line ${n}`);
      if (!/^[1-9]\d{0,3}$/.test(parts[3])) throw new Error(`Invalid units on line ${n}`);
      item.component = parts[2] as Component;
      item.units = Number(parts[3]);
    }
    return item;
  });
  return { invoiceId, provider, totalCents: toCents(totalText), items };
}
