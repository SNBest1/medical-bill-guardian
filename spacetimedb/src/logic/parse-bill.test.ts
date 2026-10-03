import { describe, expect, it } from "vitest";
import { parseItemizedBill } from "./parse-bill";
import { DEMO_STATEMENT } from "./fixtures";

describe("parseItemizedBill", () => {
  it("turns the hospital statement into six charges in cents without inventing codes", () => {
    const bill = parseItemizedBill(DEMO_STATEMENT);
    expect(bill.invoiceId).toBe("UH-48291");
    expect(bill.items).toHaveLength(6);
    expect(bill.items[0].code).toBe("99285");
    expect(bill.items[5].code).toBeUndefined();
    expect(bill.items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(482000);
    expect(bill.totalCents).toBe(482000);
  });

  it("rejects a statement without a valid total", () => {
    expect(() => parseItemizedBill(DEMO_STATEMENT.replace("Total: 4820.00", "Total: unknown"))).toThrow(/total/i);
  });

  it("rejects a malformed charge line", () => {
    expect(() => parseItemizedBill(DEMO_STATEMENT.replace("X-ray | - | 450.00", "X-ray 450.00"))).toThrow(/charge on line 3/);
  });
});
