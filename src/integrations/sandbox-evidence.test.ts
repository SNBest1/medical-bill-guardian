import { describe, expect, it } from "vitest";
import { getSandboxEvidence } from "./sandbox-evidence";

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });

describe("sandbox evidence fallback", () => {
  it("falls back when the configured Nessie URL is malformed", async () => {
    const result = await getSandboxEvidence({ NESSIE_API_KEY: "test", NESSIE_CUSTOMER_ID: "c1", NESSIE_BASE_URL: "not a url" });
    expect(result.transactionSource).toBe("MOCK");
    expect(result.recordsSource).toBe("MOCK");
  });

  it("uses the complete labeled mock story when Nessie is not configured", async () => {
    const result = await getSandboxEvidence({}, async () => { throw new Error("network should not be called"); });
    expect(result.transactionSource).toBe("MOCK");
    expect(result.recordsSource).toBe("MOCK");
    expect(result.transaction.amount).toBe(4820);
    expect(result.records).toHaveLength(5);
  });

  it("does not use mock clinical records to support a Nessie purchase when FinchNode is unavailable", async () => {
    const result = await getSandboxEvidence({ NESSIE_API_KEY: "test", NESSIE_CUSTOMER_ID: "c1", NESSIE_BASE_URL: "https://nessie.test" }, async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/customers/c1/accounts") return json([{ _id: "a1" }]);
      if (path === "/accounts/a1/purchases") return json([{ _id: "p1", merchant_id: "m1", amount: 4820, purchase_date: "2026-09-28" }]);
      if (path === "/merchants/m1") return json({ name: "University Hospital", category: "healthcare" });
      throw new Error(`Unexpected path: ${path}`);
    });
    expect(result.transactionSource).toBe("NESSIE_SANDBOX");
    expect(result.recordsSource).toBe("NONE");
    expect(result.records).toEqual([]);
  });

  it("keeps only FinchNode records near the matched provider and payment date", async () => {
    const result = await getSandboxEvidence({ NESSIE_API_KEY: "test", NESSIE_CUSTOMER_ID: "c1", NESSIE_BASE_URL: "https://nessie.test", FINCHNODE_API_KEY: "test", FINCHNODE_SUBJECT: "u1" }, async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/customers/c1/accounts") return json([{ _id: "a1" }]);
      if (path === "/accounts/a1/purchases") return json([{ _id: "p1", merchant_id: "m1", amount: 4820, purchase_date: "2026-09-28" }]);
      if (path === "/merchants/m1") return json({ name: "University Hospital", category: "healthcare" });
      if (path === "/api/v1/users/u1/records") return json({ data: { encounters: [
        { id: "e1", type: "ER visit", startDate: "2026-09-27", sourceName: "University Hospital" },
        { id: "e2", type: "Visit", startDate: "2026-09-27", sourceName: "Another Clinic" },
        { id: "e3", type: "Old visit", startDate: "2026-01-01", sourceName: "University Hospital" }
      ] } });
      throw new Error(`Unexpected path: ${path}`);
    });
    expect(result.recordsSource).toBe("FINCHNODE_SANDBOX");
    expect(result.records.map((record) => record.id)).toEqual(["e1"]);
  });
});
