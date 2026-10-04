import { describe, expect, it } from "vitest";
import { buildDynamicVariables, callBrief, fishConfigFromEnv, fishProblems, maskPhone, MAX_VARIABLE_LENGTH, spokenDate, spokenNumber } from "./fish-call";
import { scenarios } from "../scenario-data";

const env = { FISH_API_KEY: "k", FISH_AGENT_ID: "a", FISH_PHONE_NUMBER_ID: "p", FISH_TEST_TO_NUMBER: "+15555550100", DEMO_HOSPITAL_PHONE: "+15555550100", SPECTRUM_HOSPITAL_ASSIGNED_LINE: "+15555550142" };

describe("fish config", () => {
  it("is configured only when all four FISH_* variables are set", () => {
    expect(fishConfigFromEnv(env)).not.toBeNull();
    for (const name of ["FISH_API_KEY", "FISH_AGENT_ID", "FISH_PHONE_NUMBER_ID", "FISH_TEST_TO_NUMBER"] as const) expect(fishConfigFromEnv({ ...env, [name]: " " })).toBeNull();
  });
  it("reports no problems for a safe config and masks numbers", () => {
    expect(fishProblems(fishConfigFromEnv(env)!)).toEqual([]);
    expect(maskPhone("+15555550100")).toBe("ending 0100");
  });
});

describe("dynamic variables", () => {
  const config = { guardianLine: "+15555550142" };
  it.each(scenarios)("are valid Fish variables for $id", (scenario) => {
    const vars = buildDynamicVariables(scenario.hospital.name, config, scenario.id);
    expect(Object.keys(vars).length).toBeLessThanOrEqual(50);
    for (const [name, value] of Object.entries(vars)) {
      expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      expect(typeof value).toBe("string");
      expect(value.length).toBeLessThanOrEqual(MAX_VARIABLE_LENGTH);
    }
    expect(vars.patient_name).toBe(`${scenario.patient.firstName} ${scenario.patient.lastName}`);
    expect(vars.hospital_name).toBe(scenario.hospital.name);
    expect(callBrief(vars).join(" ")).toContain(vars.guardian_line_spoken);
  });
  it("speaks dates and numbers", () => {
    expect(spokenDate("2026-09-01")).toBe("September 1st");
    expect(spokenDate("2026-09-02")).toBe("September 2nd");
    expect(spokenDate("2026-09-13")).toBe("September 13th");
    expect(spokenDate("2026-09-23")).toBe("September 23rd");
    expect(spokenNumber("+15555550100")).toBe("+1; 5 5 5; 5 5 5; 0 1 0 0");
  });
  it("rejects an unknown hospital", () => {
    expect(() => buildDynamicVariables("Nowhere Clinic", config)).toThrow();
  });
  it("will not guess a patient from the hospital name when several patients share it", () => {
    expect(() => buildDynamicVariables("Northstar Health System", config)).toThrow(/which patient/);
    expect(() => buildDynamicVariables("Northstar Health System", config, "no-such-scenario")).toThrow();
  });
  it("speaks the service date the bill is for, not a guess", () => {
    expect(buildDynamicVariables("Northstar Health System", config, "harriet-kidney")).toMatchObject({ payment_date: "January 20th", service_date: "January 20th" });
  });
});
