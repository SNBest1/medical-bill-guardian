import { describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { discoverHospitalPayments } from "./discovery";
import { demoTransaction } from "../demo";

describe("hospital payment dispatch", () => {
  it("creates one case across repeated polls and stops before any record access or contact", async () => {
    const store = new CaseStore(":memory:");
    const bank = { getTransactions: async () => [demoTransaction, { ...demoTransaction, id: "nonmedical", category: "retail", merchant: "Grocery" }, { ...demoTransaction, id: "refund", amount: -700 }] };
    try {
      expect((await discoverHospitalPayments(store, bank)).detected).toBe(1);
      expect((await discoverHospitalPayments(store, bank)).cases).toHaveLength(1);
      expect(store.list()).toHaveLength(1);
      expect(store.list()[0].status).toBe("DETECTED");
      expect(store.list()[0].medicalRecords).toEqual([]);
      expect(store.list()[0].communications).toEqual([]);
    } finally { store.close(); }
  });

  it("requires an explicit merchant allowlist match when one is configured, beyond the name/category heuristic", async () => {
    const store = new CaseStore(":memory:");
    const bank = { getTransactions: async () => [demoTransaction] };
    const previous = process.env.GUARDIAN_APPROVED_MERCHANTS;
    try {
      process.env.GUARDIAN_APPROVED_MERCHANTS = "Some Other Hospital";
      expect((await discoverHospitalPayments(store, bank)).detected).toBe(0);
      process.env.GUARDIAN_APPROVED_MERCHANTS = "University Hospital";
      expect((await discoverHospitalPayments(store, bank)).detected).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.GUARDIAN_APPROVED_MERCHANTS;
      else process.env.GUARDIAN_APPROVED_MERCHANTS = previous;
      store.close();
    }
  });
});
