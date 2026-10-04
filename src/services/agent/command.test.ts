import { describe, expect, it } from "vitest";
import { resolveCommand } from "./command";

const id = (text: string) => { const result = resolveCommand(text); return result.kind === "match" ? result.scenario.id : result.kind; };
const options = (text: string) => { const result = resolveCommand(text); return result.kind === "ambiguous" ? result.options.map((scenario) => scenario.id).sort() : []; };

describe("resolveCommand", () => {
  it("finds the patient from a first or last name", () => {
    expect(id("investigate Morgan hospital bill")).toBe("morgan-wellness");
    expect(id("Please look into Morgan's hospital bill")).toBe("morgan-wellness");
    expect(id("investigate Harriet Lindqvist")).toBe("harriet-kidney");
    expect(id("check Rivera's bill")).toBe("morgan-wellness");
    expect(id("look into Abernathy")).toBe("theo-asthma");
    expect(id("investigate Theo")).toBe("theo-asthma");
  });
  it("finds the patient from a condition word", () => {
    expect(id("look into the wellness visit bill")).toBe("morgan-wellness");
    expect(id("the diabetes follow-up bill")).toBe("morgan-wellness");
    expect(id("what happened with the kidney bill")).toBe("harriet-kidney");
    expect(id("check the heart patient")).toBe("harriet-kidney");
    expect(id("investigate the asthma bill")).toBe("theo-asthma");
    expect(id("the child's bill")).toBe("theo-asthma");
  });
  it("prefers a name over a condition word", () => {
    expect(id("investigate Morgan's bill, not the asthma one")).toBe("morgan-wellness");
    expect(id("Theo, not the kidney bill")).toBe("theo-asthma");
  });
  it("treats the shared hospital name as ambiguous, never decisive", () => {
    expect(id("check the Northstar bill")).toBe("ambiguous");
    expect(options("check the Northstar Health System bill")).toEqual(["harriet-kidney", "morgan-wellness", "theo-asthma"]);
    expect(id("check Morgan's Northstar bill")).toBe("morgan-wellness");
    expect(id("the Northstar asthma bill")).toBe("theo-asthma");
  });
  it("asks instead of guessing when it is unclear or unknown", () => {
    expect(id("investigate my hospital bill")).toBe("unknown");
    expect(id("investigate Morgan and Harriet")).toBe("ambiguous");
    expect(id("")).toBe("unknown");
  });
});
