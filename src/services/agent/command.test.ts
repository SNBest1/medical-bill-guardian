import { describe, expect, it } from "vitest";
import { resolveCommand } from "./command";

const id = (text: string) => { const result = resolveCommand(text); return result.kind === "match" ? result.scenario.id : result.kind; };

describe("resolveCommand", () => {
  it("finds the patient from a name, hospital, or injury", () => {
    expect(id("investigate Maya hospital bill")).toBe("bike-wrist");
    expect(id("Please look into Maya's hospital bill")).toBe("bike-wrist");
    expect(id("check the Summit Trauma bill")).toBe("car-concussion");
    expect(id("investigate Priya Nair")).toBe("ski-ankle");
    expect(id("look into the sprained ankle bill")).toBe("ski-ankle");
    expect(id("what happened with the concussion")).toBe("car-concussion");
  });
  it("prefers a name over an injury word", () => {
    expect(id("investigate Maya's bill, not the concussion one")).toBe("bike-wrist");
  });
  it("asks instead of guessing when it is unclear or unknown", () => {
    expect(id("investigate my hospital bill")).toBe("unknown");
    expect(id("investigate Maya and Daniel")).toBe("ambiguous");
    expect(id("")).toBe("unknown");
  });
});
