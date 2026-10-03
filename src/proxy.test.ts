import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("live-mode guard", () => {
  it("blocks API access when production identity and consent are not implemented", async () => {
    const previous = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    try {
      const response = proxy(new NextRequest("http://localhost:3000/api/cases"));
      expect(response.status).toBe(503);
      expect((await response.json()).error).toMatch(/live mode/i);
    } finally { process.env.DEMO_MODE = previous; }
  });
});
