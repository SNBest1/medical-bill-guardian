import { describe, expect, it, vi } from "vitest";
import { generateCaseSummary } from "./summary";
import { createCase, investigateCase, requestItemizedBill, analyzeCase, reviewCase } from "./orchestrator";
import { demoTransaction } from "../demo";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";

async function reviewedCase() {
  const provider = new MockCommunicationProvider(0);
  const ready = await investigateCase(createCase(demoTransaction), new MockMedicalRecordProvider());
  const waiting = await requestItemizedBill(ready, provider, true);
  const investigated = await analyzeCase(waiting, provider);
  return reviewCase(investigated, new MockCommunicationProvider(), true);
}

describe("AI summary boundary", () => {
  it("uses deterministic text when an API key is unavailable", async () => {
    const fetcher = vi.fn();
    const text = await generateCaseSummary(await reviewedCase(), "Verified $700 correction", undefined, fetcher);
    expect(text).toBe("Verified $700 correction");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("only accepts AI text that preserves the confirmed amounts", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: "function_call", name: "get_case_facts", call_id: "call_1", arguments: "{}" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: "The bill changed from $4,820 to $4,120 after a $700 duplicate was removed." }] }] }) });
    const text = await generateCaseSummary(await reviewedCase(), "fallback", "test-key", fetcher);
    expect(text).toContain("$700");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const second = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(second.input.some((item: { type: string }) => item.type === "function_call_output")).toBe(true);
    expect(second.store).toBe(false);
  });

  it("rejects a summary that invents another dollar amount", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: "function_call", name: "get_case_facts", call_id: "call_1", arguments: "{}" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: "The $4,820 bill became $4,120 after a $700 correction. The fair price was $2,000." }] }] }) });
    expect(await generateCaseSummary(await reviewedCase(), "fallback", "test-key", fetcher)).toBe("fallback");
  });
});
