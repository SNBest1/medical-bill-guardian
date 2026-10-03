import { describe, expect, it } from "vitest";
import { parseItemizedBill } from "./parse-bill";
import { demoStatement } from "../demo";

describe("parseItemizedBill", () => {
  it("turns the hospital statement into six charges without inventing codes", () => {
    const bill = parseItemizedBill(demoStatement);
    expect(bill.invoiceId).toBe("UH-48291");
    expect(bill.items).toHaveLength(6);
    expect(bill.items[0].code).toBe("99285");
    expect(bill.items[5].code).toBeUndefined();
    expect(bill.items.reduce((sum, item) => sum + item.amount, 0)).toBe(4820);
  });

  it("rejects a statement without a valid total", () => {
    expect(() => parseItemizedBill(demoStatement.replace("Total: 4820.00", "Total: unknown"))).toThrow(/total/i);
  });
});
