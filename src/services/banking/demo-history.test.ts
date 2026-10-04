import { describe, expect, it } from "vitest";
import { scenarios } from "../scenarios";
import { createCase, receiveDemoRefund } from "../agent/orchestrator";
import { demoBankHistory } from "./demo-history";

function morgan() {
  const scenario = scenarios.find((s) => s.id === "morgan-wellness")!;
  const c = createCase(scenario.transaction);
  c.scenarioId = scenario.id;
  c.status = "USER_NOTIFIED";
  c.resolution = { result: "DUPLICATE_REMOVED", originalTotal: 1102, correctedTotal: 792, adjustment: 310, explanation: "Demo correction" };
  c.recovery = { status: "REFUND_PENDING", amount: 310, confirmation: "Demo correction", simulated: true };
  return c;
}

describe("demo bank history", () => {
  it("balances all three histories in cents and includes the original hospital payment", () => {
    for (const s of scenarios) {
      const history = demoBankHistory(s.id)!;
      let balance = Math.round(history.opening * 100);
      for (const entry of [...history.entries].reverse()) {
        balance += Math.round(entry.amount * 100);
        expect(Math.round(entry.balance * 100)).toBe(balance);
      }
      expect(history.balance).toBe(balance / 100);
      expect(history.netPaid).toBe(s.transaction.amount);
      expect(history.entries.find((entry) => entry.kind === "hospital")?.id).toBe(s.transaction.id);
      expect(history.refund).toBe(0);
    }
  });
  it("does not add pending refunds to the balance", () => {
    const history = demoBankHistory("morgan-wellness", morgan())!;
    expect(history.pendingRefund).toBe(310);
    expect(history.balance).toBe(history.afterCharge);
    expect(history.netPaid).toBe(1102);
    expect(history.entries.filter((entry) => entry.kind === "refund")).toHaveLength(0);
  });
  it("posts a received credit once, increases the balance and reduces net hospital spending", () => {
    const received = receiveDemoRefund(morgan());
    const history = demoBankHistory("morgan-wellness", received)!;
    expect(history.balance).toBe(3721.58);
    expect(history.afterCharge).toBe(3411.58);
    expect(history.refund).toBe(310);
    expect(history.netPaid).toBe(792);
    expect(history.entries[0].kind).toBe("refund");
    expect(demoBankHistory("morgan-wellness", receiveDemoRefund(received))).toEqual(history);
  });
  it("never transfers another patient's refund into Harriet or Theo's account", () => {
    const received = receiveDemoRefund(morgan());
    for (const id of ["harriet-kidney", "theo-asthma"]) {
      expect(demoBankHistory(id, received)?.refund).toBe(0);
    }
    expect(demoBankHistory("unknown")).toBeNull();
  });
});
