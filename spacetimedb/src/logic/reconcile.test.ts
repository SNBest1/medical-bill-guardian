import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";
import { parseItemizedBill } from "./parse-bill";
import { DEMO_RECORDS, DEMO_STATEMENT } from "./fixtures";

const bill = parseItemizedBill(DEMO_STATEMENT);

describe("reconcile", () => {
  it("requires review when a charge has no matching clinical evidence", () => {
    const specialist = reconcile(bill, DEMO_RECORDS).find((item) => item.description === "Specialist consultation");
    expect(specialist?.clinicalStatus).toBe("NO_MATCH_FOUND");
    expect(specialist?.action).toBe("REQUEST_REVIEW");
    expect(specialist?.lineIndex).toBe(6);
    expect(specialist?.explanation).toMatch(/does not prove/i);
  });

  it("supports six documented services without inventing a price comparison", () => {
    const result = reconcile(bill, DEMO_RECORDS);
    expect(result.filter((item) => item.clinicalStatus === "SUPPORTED")).toHaveLength(6);
    expect(result.every((item) => item.pricingStatus === "NOT_ASSESSED")).toBe(true);
  });

  it("flags a one-cent total mismatch exactly", () => {
    const result = reconcile({ ...bill, totalCents: 481999 }, DEMO_RECORDS);
    const total = result.find((item) => item.clinicalStatus === "AMOUNT_REVIEW");
    expect(total?.lineIndex).toBeNull();
    expect(total?.evidence[0]).toBe("Line items total $4,820; stated total is $4,819.99.");
  });

  it("flags an exact duplicate line", () => {
    const doubled = { ...bill, items: [...bill.items, bill.items[1]] };
    expect(reconcile(doubled, DEMO_RECORDS)[7].clinicalStatus).toBe("DUPLICATE_SUSPECTED");
  });
});
