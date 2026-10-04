import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseStore } from "../../lib/db";
import { createCase } from "../agent/orchestrator";
import { scenarios } from "../scenarios";
import { receiveBankRefund, NessieRefundUncertainError } from "./nessie-refund";
import { currentMilestone } from "../agent/progress-updates";
import { nessieBankHistory } from "./nessie-history";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: (path: string, ...args: unknown[]) => path === "data/nessie-seed.json" ? JSON.stringify({ "morgan-wellness": { accountId: "account", customerId: "customer", purchaseId: "payment" } }) : actual.readFileSync(path, ...(args as [never])) };
});
afterEach(() => vi.unstubAllEnvs());
function setup() {
 vi.stubEnv("NESSIE_SANDBOX_DISCOVERY", "true"); vi.stubEnv("NESSIE_BASE_URL", "https://prod-api.nessieisreal.com"); vi.stubEnv("NESSIE_API_KEY", "test-key"); vi.stubEnv("DEMO_MODE", "true");
 const scenario = scenarios.find((s) => s.id === "morgan-wellness")!;
 const c = createCase(scenario.transaction); c.transaction.id = "payment"; c.scenarioId = scenario.id; c.status = "USER_NOTIFIED";
 c.resolution = { result: "DUPLICATE_REMOVED", originalTotal: 1102, correctedTotal: 792, adjustment: 310, explanation: "Confirmed demo correction" };
 c.recovery = { status: "REFUND_PENDING", amount: 310, confirmation: "Demo", simulated: true };
 // isDemoTransaction recognises the synthetic scenario by provider, date and amount.
 const deposits: Record<string, unknown>[] = [];
 const send = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
   const url = new URL(String(input));
   if (url.pathname.endsWith("/accounts") && init?.method !== "POST") return Response.json([{ _id: "account", nickname: "Morgan checking", balance: 15000 }]);
   if (url.pathname.endsWith("/deposits")) {
    if (init?.method === "POST") { deposits.push({ ...JSON.parse(String(init.body)), _id: "credit" }); return Response.json({ objectCreated: deposits[0] }); }
    return Response.json(deposits);
   }
   if (url.pathname.endsWith("/purchases")) return Response.json([{ _id: "payment", amount: 1102, purchase_date: "2026-07-18", status: "pending" }]);
   if (url.pathname.endsWith("/withdrawals")) return Response.json([]);
   throw new Error("Unexpected endpoint");
 }) as unknown as typeof fetch;
 return { c, deposits, send };
}
describe("Nessie refund and history", () => {
 it("posts and verifies one refund, including across a reset, without inventing a balance increase", async () => {
  const { c, send } = setup(); const store = new CaseStore(":memory:");
  const next = await receiveBankRefund(store, c, send);
  expect(next.recovery?.bankSource).toBe("nessie"); expect(next.recovery?.creditTransactionId).toBe("credit");
  expect(next.recovery?.balanceBefore).toBe(15000); expect(next.recovery?.balanceAfter).toBe(15000);
  expect(next.recovery?.calculatedBalanceAfter).toBe(1408);
  expect(currentMilestone(next)?.text).toContain("Calculated demo balance left: $1,408");
  expect(currentMilestone(next)?.text).not.toContain("15,000");
  const legacy = { ...next, recovery: { ...next.recovery!, calculatedBalanceAfter: undefined } };
  expect(currentMilestone(legacy)?.text).toContain("Calculated demo balance is unavailable");
  expect(currentMilestone(legacy)?.text).not.toContain("15,000");
  await receiveBankRefund(store, c, send); // Original pending case simulates reset / replay.
  expect(vi.mocked(send).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  const history = await nessieBankHistory("morgan-wellness", next, send);
  expect(history.balance).toBe(1408); expect(history.reportedBalance).toBe(15000); expect(history.afterCharge).toBe(1098); expect(history.refund).toBe(310); expect(history.netPaid).toBe(792);
  expect(history.entries[0].kind).toBe("refund"); expect(history.entries[0].balance).toBe(1408);
  store.close();
 });
 it("reserves pending expenses but excludes pending deposits and cancelled payments", async () => {
  const { c, send } = setup();
  const source = (async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/deposits")) return Response.json([{ _id: "pending-income", amount: 900, status: "pending", transaction_date: "2026-07-19" }]);
    if (path.endsWith("/withdrawals")) return Response.json([{ _id: "reserved", amount: 20, status: "pending", transaction_date: "2026-07-19" }, { _id: "cancelled", amount: 50, status: "cancelled", transaction_date: "2026-07-20" }]);
    return send(input, init);
  }) as typeof fetch;
  const history = await nessieBankHistory("morgan-wellness", c, source);
  expect(history.balance).toBe(1078); expect(history.pendingRefund).toBe(310);
  expect(history.entries.find((e) => e.id === "pending-income")?.balance).toBe(1098);
  expect(history.entries.find((e) => e.id === "cancelled")?.balance).toBe(1078);
 });
 it("never resends an uncertain bank write", async () => {
  const { c, send } = setup(); const store = new CaseStore(":memory:");
  const broken = vi.fn(async (input, init) => { if (init?.method === "POST") throw new Error("network timeout"); return send(input, init); }) as typeof fetch;
  await expect(receiveBankRefund(store, c, broken)).rejects.toBeInstanceOf(NessieRefundUncertainError);
  await expect(receiveBankRefund(store, c, broken)).rejects.toBeInstanceOf(NessieRefundUncertainError);
  expect(vi.mocked(broken).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  store.close();
 });
 it("blocks an unapproved credit before writing to Nessie", async () => {
  const { c, send } = setup(); c.status = "REVIEW_REQUIRED";
  const store = new CaseStore(":memory:");
  await expect(receiveBankRefund(store, c, send)).rejects.toThrow("completed synthetic review");
  expect(send).not.toHaveBeenCalled(); store.close();
 });
});
