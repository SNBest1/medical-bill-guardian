import { describe, expect, it } from "vitest";
import { normalizeNessiePurchase } from "./nessie";

describe("Nessie normalization", () => {
  it("uses the merchant record rather than purchase description for healthcare detection", () => {
    expect(normalizeNessiePurchase({ _id: "p1", merchant_id: "m1", description: "ER copay", amount: 4820, purchase_date: "2026-09-28" }, "University Hospital")).toEqual({ id: "p1", merchant: "University Hospital", amount: 4820, date: "2026-09-28" });
  });
});
