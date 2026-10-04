import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MedicalBillCase } from "../../../../../types/domain";
import { createCase } from "../../../../../services/agent/orchestrator";
import { demoTransaction } from "../../../../../services/demo";
import { FishCallError } from "../../../../../services/communications/fish-demo";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  requestItemizedBill: vi.fn(),
}));

vi.mock("../../../../../lib/db", () => ({
  getStore: () => ({ get: mocks.get, save: mocks.save }),
}));

vi.mock("../../../../../lib/providers", () => ({
  communicationProvider: () => ({ requestItemizedBill: mocks.requestItemizedBill }),
}));

import { POST } from "./route";

const readyCase = (): MedicalBillCase => ({
  ...createCase(demoTransaction),
  status: "REQUESTING_BILL",
});

const invoke = (body: object, id = "CASE-4821") => POST(
  new Request(`http://localhost/api/cases/${id}/request-bill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id }) },
);

describe("POST /api/cases/[id]/request-bill", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.save.mockReset();
    mocks.requestItemizedBill.mockReset();
  });

  it("queues an authorized request and saves the resulting case", async () => {
    const current = readyCase();
    mocks.get.mockReturnValue(current);
    mocks.requestItemizedBill.mockResolvedValue({
      id: "communication-1",
      type: "ITEMIZED_BILL_REQUEST",
      timestamp: "2026-10-03T12:00:00.000Z",
      status: "PENDING",
      transcript: "AI demo call to University Hospital billing at the configured recipient ending 0199.",
      result: "Fish call queued · session session-1",
    });

    const response = await invoke({ authorized: true });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe("WAITING_FOR_BILL");
    expect(mocks.requestItemizedBill).toHaveBeenCalledWith({
      caseId: "CASE-4821",
      providerName: "University Hospital",
    });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ status: "WAITING_FOR_BILL" }));
  });

  it("returns 404 when the case does not exist", async () => {
    mocks.get.mockReturnValue(null);

    const response = await invoke({ authorized: true }, "missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Case not found" });
    expect(mocks.requestItemizedBill).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("returns 400 when explicit authorization is absent", async () => {
    mocks.get.mockReturnValue(readyCase());

    const response = await invoke({});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ error: expect.stringMatching(/authorization/i) }));
    expect(mocks.requestItemizedBill).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("preserves a safe Fish error status and body without saving", async () => {
    mocks.get.mockReturnValue(readyCase());
    mocks.requestItemizedBill.mockRejectedValue(new FishCallError(422, '{"detail":"destination blocked"}'));

    const response = await invoke({ authorized: true });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Fish Audio call failed",
      upstreamStatus: 422,
      responseBody: '{"detail":"destination blocked"}',
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
