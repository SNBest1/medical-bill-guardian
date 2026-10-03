import { describe, expect, it } from "vitest";
import { CaseStore } from "../../lib/db";
import { createCase } from "./orchestrator";
import { demoTransaction } from "../demo";
import { mutateCase, CaseBusyError } from "./case-operation";

class Tagged extends Error {}

describe("mutateCase retention", () => {
  it("releases the guard on an untagged failure but retains it when the predicate says to", async () => {
    const store = new CaseStore(":memory:");
    try {
      store.create(createCase(demoTransaction));
      const id = "CASE-4821";
      await expect(mutateCase(store, id, () => { throw new Error("plain read failure"); }, (error) => error instanceof Tagged)).rejects.toThrow(/plain read failure/);
      const token = store.acquireOperation(id);
      expect(token).toBeTruthy();
      store.releaseOperation(id, token!);
    } finally { store.close(); }
  });

  it("retains the guard when the predicate matches the thrown error, requiring manual recovery", async () => {
    const store = new CaseStore(":memory:");
    try {
      store.create(createCase(demoTransaction));
      const id = "CASE-4821";
      await expect(mutateCase(store, id, () => { throw new Tagged("ambiguous contact"); }, (error) => error instanceof Tagged)).rejects.toThrow(/ambiguous contact/);
      await expect(mutateCase(store, id, (current) => current)).rejects.toBeInstanceOf(CaseBusyError);
    } finally { store.close(); }
  });
});
