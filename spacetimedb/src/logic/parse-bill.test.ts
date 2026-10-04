import { describe, expect, it } from "vitest";
import { parseItemizedBill } from "./parse-bill";
import { DEMO_STATEMENT } from "./fixtures";

describe("parseItemizedBill", () => {
  it("turns the hospital statement into seven coded charges in cents", () => {
    const bill = parseItemizedBill(DEMO_STATEMENT);
    expect(bill.invoiceId).toBe("UMH-48291");
    expect(bill.provider).toBe("University of Michigan Health");
    expect(bill.items).toHaveLength(7);
    expect(bill.items.every((item) => item.code)).toBe(true);
    expect(bill.items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(482000);
    expect(bill.totalCents).toBe(482000);
  });

  it("reads the setting header and each line's component and units", () => {
    const [er, physician] = parseItemizedBill(DEMO_STATEMENT).items;
    expect(er).toMatchObject({ code: "99285", setting: "OUTPATIENT", component: "FACILITY", units: 1 });
    expect(physician).toMatchObject({ code: "99285", component: "PROFESSIONAL" });
  });

  it("still accepts the three-column form, with '-' for a missing code", () => {
    const item = parseItemizedBill(DEMO_STATEMENT.replace("Chest X-ray | 71046 | FACILITY | 1 | 240.00", "Chest X-ray | - | 240.00")).items[3];
    expect(item).toMatchObject({ description: "Chest X-ray", amountCents: 24000 });
    expect(item.code).toBeUndefined();
    expect(item.component).toBeUndefined();
  });

  it("rejects an unknown component or setting", () => {
    expect(() => parseItemizedBill(DEMO_STATEMENT.replace("| FACILITY | 1 | 240.00", "| CLINIC | 1 | 240.00"))).toThrow(/component on line 4/);
    expect(() => parseItemizedBill(DEMO_STATEMENT.replace("Setting: OUTPATIENT", "Setting: HOME"))).toThrow(/Setting/);
  });

  it("rejects a statement without a valid total", () => {
    expect(() => parseItemizedBill(DEMO_STATEMENT.replace("Total: 4820.00", "Total: unknown"))).toThrow(/total/i);
  });

  it("rejects a malformed charge line", () => {
    expect(() => parseItemizedBill(DEMO_STATEMENT.replace("Chest X-ray | 71046 | FACILITY | 1 | 240.00", "Chest X-ray 240.00"))).toThrow(/charge on line 4/);
  });
});
