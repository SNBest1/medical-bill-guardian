import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FishDemoCommunicationProvider } from "../services/communications/fish-demo";
import { MockCommunicationProvider } from "../services/communications/mock";
import { communicationProvider } from "./providers";

const names = [
  "DEMO_MODE",
  "FISH_API_KEY",
  "FISH_AGENT_ID",
  "FISH_PHONE_NUMBER_ID",
  "FISH_TEST_TO_NUMBER",
] as const;

let original: Partial<Record<(typeof names)[number], string>>;

beforeEach(() => {
  original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.DEMO_MODE = "true";
  process.env.FISH_API_KEY = "fish-secret";
  process.env.FISH_AGENT_ID = "agent-1";
  process.env.FISH_PHONE_NUMBER_ID = "phone-1";
  process.env.FISH_TEST_TO_NUMBER = "+13135550199";
});

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("communicationProvider", () => {
  it.each([
    "FISH_API_KEY",
    "FISH_AGENT_ID",
    "FISH_PHONE_NUMBER_ID",
    "FISH_TEST_TO_NUMBER",
  ] as const)("uses the mock provider when %s is absent", (missingName) => {
    delete process.env[missingName];

    expect(communicationProvider()).toBeInstanceOf(MockCommunicationProvider);
  });

  it("uses the Fish demo provider when all Fish variables are configured", () => {
    expect(communicationProvider()).toBeInstanceOf(FishDemoCommunicationProvider);
  });

  it("preserves the live-mode communication guard", () => {
    process.env.DEMO_MODE = "false";

    expect(() => communicationProvider()).toThrow(/adapter must be configured/i);
  });
});
