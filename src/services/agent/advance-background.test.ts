import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseStore } from "../../lib/db";
import { createCase } from "./orchestrator";
import { advanceBackgroundCase } from "./advance-background";
import { MockCommunicationProvider } from "../communications/mock";
const store = new CaseStore(":memory:");
afterEach(() => vi.unstubAllEnvs());
describe("background patient updates", () => {
  it("finishes a resolved case with no website session or new hospital call", async () => {
    vi.stubEnv("PHOTON_UPDATE_TEXTS", "false"); vi.stubEnv("OPENAI_API_KEY", "");
    const c = { ...createCase({ id: "background", merchant: "Hospital", amount: 30, date: "2026-09-28" }), scenarioId: "morgan-wellness", status: "RESOLVED" as const };
    store.create(c); store.selectPatient(c.scenarioId); store.attachActiveCase(c);
    const provider = new MockCommunicationProvider();
    const request = vi.spyOn(provider, "requestItemizedBill");
    const review = vi.spyOn(provider, "requestBillingReview");
    expect(await advanceBackgroundCase(store, provider)).toBe("advanced");
    expect(store.get(c.id)?.status).toBe("USER_NOTIFIED");
    expect(await advanceBackgroundCase(store, provider)).toBe("idle");
    expect(request).not.toHaveBeenCalled(); expect(review).not.toHaveBeenCalled();
  });
});
