import { describe, expect, it } from "vitest";
import { dispatchPending } from "./dispatch";
import type { PendingEmail } from "./db";
import type { Env } from "./types";

const env = { EMAIL_SEND_ENABLED: "true" } as Env;
const pending = (id: string): PendingEmail => ({ communicationId: id, caseId: id, kind: "EMAIL_ITEMIZED_BILL_REQUEST", merchant: "University of Michigan Health", paidOn: "2026-09-28" });

function deps(items: PendingEmail[], sentToday = 0, failOn: string[] = []) {
  const reducers: [string, unknown[]][] = [];
  return {
    reducers,
    deps: {
      pendingEmails: async () => items,
      sentInLast24h: async () => sentToday,
      send: async (_env: Env, item: PendingEmail) => { if (failOn.includes(item.caseId)) throw new Error(`Resend send failed (500) for ${item.caseId}`); return `resend-${item.caseId}`; },
      callReducer: async (_env: Env, name: string, args: unknown[]) => { reducers.push([name, args]); },
    },
  };
}

describe("dispatchPending", () => {
  it("does nothing while sending is disabled", async () => {
    const run = deps([pending("1")]);
    expect(await dispatchPending({ EMAIL_SEND_ENABLED: "false" } as Env, run.deps)).toEqual({ sent: 0, failed: 0, capped: 0 });
    expect(run.reducers).toEqual([]);
  });

  it("records a failure durably and keeps sending the rest", async () => {
    const run = deps([pending("1"), pending("2")], 0, ["1"]);
    expect(await dispatchPending(env, run.deps)).toEqual({ sent: 1, failed: 1, capped: 0 });
    expect(run.reducers).toEqual([
      ["record_outbound_failure", [1, "Resend send failed (500) for 1"]],
      ["record_outbound_email", [2, "EMAIL_ITEMIZED_BILL_REQUEST", "resend-2"]],
    ]);
  });

  it("stops at the daily cap and leaves the rest pending", async () => {
    const run = deps([pending("1"), pending("2"), pending("3")], 9);
    expect(await dispatchPending({ ...env, EMAIL_DAILY_LIMIT: "10" }, run.deps)).toEqual({ sent: 1, failed: 0, capped: 2 });
    expect(run.reducers.map(([name]) => name)).toEqual(["record_outbound_email"]);
  });

  it("does not abort the run when a sent email cannot be recorded", async () => {
    const run = deps([pending("1"), pending("2")]);
    let calls = 0;
    const callReducer = async (_env: Env, name: string, args: unknown[]) => { calls++; if (calls === 1) throw new Error("SpacetimeDB record_outbound_email failed (400)"); run.reducers.push([name, args]); };
    expect(await dispatchPending(env, { ...run.deps, callReducer })).toEqual({ sent: 2, failed: 0, capped: 0 });
    expect(run.reducers).toEqual([["record_outbound_email", [2, "EMAIL_ITEMIZED_BILL_REQUEST", "resend-2"]]]);
  });
});
