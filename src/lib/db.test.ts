import { describe, expect, it } from "vitest";
import { CaseStore } from "./db";
import { createCase } from "../services/agent/orchestrator";
import { demoTransaction } from "../services/demo";

describe("CaseStore", () => {
  it("deduplicates cases by transaction and persists their updated state", () => {
    const store = new CaseStore(":memory:");
    const first = store.create(createCase(demoTransaction));
    const second = store.create(createCase(demoTransaction));
    expect(second.id).toBe(first.id);
    expect(store.list()).toHaveLength(1);
    store.save({ ...first, status: "REVIEW_REQUIRED" });
    expect(store.get(first.id)?.status).toBe("REVIEW_REQUIRED");
    store.close();
  });
});
