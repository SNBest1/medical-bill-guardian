import type { ItemizedBill } from "../../types/domain";

/** Parses the demo provider's plain-text statement into validated bill items. */
export function parseItemizedBill(statement: string): ItemizedBill {
  const lines = statement.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const field = (name: string) => lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2).trim();
  const invoiceId = field("Invoice");
  const provider = field("Provider");
  const serviceDate = field("Service date");
  const totalText = field("Total");
  const start = lines.indexOf("Charges");
  const end = lines.findIndex((line) => line.startsWith("Total: "));
  if (!invoiceId || !provider || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate ?? "") || !/^\d+(?:\.\d{2})?$/.test(totalText ?? "") || start < 0 || end <= start + 1) throw new Error("Itemized statement is missing required bill fields or total");
  const items = lines.slice(start + 1, end).map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length !== 3 || !parts[0] || !/^\d+(?:\.\d{2})?$/.test(parts[2])) throw new Error(`Invalid itemized charge on line ${index + 1}`);
    return { id: `bill-${index + 1}`, description: parts[0], code: parts[1] === "-" ? undefined : parts[1], amount: Number(parts[2]), serviceDate: serviceDate! };
  });
  return { invoiceId, provider, total: Number(totalText), items };
}
