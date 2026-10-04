import { describe, expect, it } from "vitest";
import { formatDollars, toCents } from "./money";

describe("money", () => {
  it("parses statement amounts into exact cents", () => {
    expect(toCents("4820.00")).toBe(482000);
    expect(toCents("700")).toBe(70000);
    expect(toCents("0.05")).toBe(5);
  });

  it("formats cents without Intl, dropping zero cents", () => {
    expect(formatDollars(412000)).toBe("$4,120");
    expect(formatDollars(70050)).toBe("$700.50");
    expect(formatDollars(0)).toBe("$0");
    expect(formatDollars(123456789)).toBe("$1,234,567.89");
  });
});
