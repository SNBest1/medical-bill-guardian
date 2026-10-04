import { scenarioForProvider } from "../scenarios";

/**
 * Server-side configuration, safety checks, and per-call dynamic variables for the Fish Audio
 * demo call. Nothing here talks to the network. The destination is never taken from a browser,
 * request body, or case: it is FISH_TEST_TO_NUMBER and must equal DEMO_HOSPITAL_PHONE.
 */

export const E164_NUMBER = /^\+[1-9]\d{7,14}$/;
const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
/** Fish allows 1000 characters per string and 50 variables; we stay far below both. */
export const MAX_VARIABLE_LENGTH = 200;

export type FishDemoConfig = {
  apiKey: string;
  agentId: string;
  phoneNumberId: string;
  /** The only number that may be dialed (FISH_TEST_TO_NUMBER). */
  toNumber: string;
  /** The approved hospital stand-in (DEMO_HOSPITAL_PHONE); the destination must equal it. */
  hospitalPhone: string;
  /** The Guardian line the hospital is asked to text the bill link to (SPECTRUM_HOSPITAL_ASSIGNED_LINE). */
  guardianLine: string;
};

export type FishDynamicVariables = Record<string, string>;

/** Raised before any request when configuration is unsafe or incomplete. Messages name variables, never values. */
export class FishConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Fish call is not ready: ${problems.join("; ")}`);
    this.name = "FishConfigError";
  }
}

const clean = (value: string | undefined) => value?.trim() ?? "";

/** Returns a config only when all four FISH_* variables are set; the safety checks happen in {@link fishProblems}. */
export function fishConfigFromEnv(env: Record<string, string | undefined> = process.env): FishDemoConfig | null {
  const config: FishDemoConfig = {
    apiKey: clean(env.FISH_API_KEY),
    agentId: clean(env.FISH_AGENT_ID),
    phoneNumberId: clean(env.FISH_PHONE_NUMBER_ID),
    toNumber: clean(env.FISH_TEST_TO_NUMBER),
    hospitalPhone: clean(env.DEMO_HOSPITAL_PHONE),
    guardianLine: clean(env.SPECTRUM_HOSPITAL_ASSIGNED_LINE),
  };
  return config.apiKey && config.agentId && config.phoneNumberId && config.toNumber ? config : null;
}

/** Everything that would stop a call, as messages that never contain a configured value. */
export function fishProblems(config: FishDemoConfig): string[] {
  const problems: string[] = [];
  const missing = ([["FISH_API_KEY", config.apiKey], ["FISH_AGENT_ID", config.agentId], ["FISH_PHONE_NUMBER_ID", config.phoneNumberId], ["FISH_TEST_TO_NUMBER", config.toNumber]] as const).filter(([, value]) => !value.trim()).map(([name]) => name);
  if (missing.length) problems.push(`missing ${missing.join(", ")}`);
  if (config.toNumber && !E164_NUMBER.test(config.toNumber)) problems.push("FISH_TEST_TO_NUMBER must be a valid E.164 phone number");
  if (!config.hospitalPhone) problems.push("DEMO_HOSPITAL_PHONE must be set to the approved hospital stand-in number");
  else if (config.toNumber && config.toNumber !== config.hospitalPhone) problems.push("FISH_TEST_TO_NUMBER must equal DEMO_HOSPITAL_PHONE");
  if (!E164_NUMBER.test(config.guardianLine)) problems.push("SPECTRUM_HOSPITAL_ASSIGNED_LINE must be a valid E.164 number so the hospital knows where to text the bill");
  return problems;
}

/** "ending 5955": the only form of a phone number the browser or logs ever see. */
export const maskPhone = (phone: string) => phone.length >= 4 ? `ending ${phone.slice(-4)}` : "configured number";

const cap = (value: string) => value.length > MAX_VARIABLE_LENGTH ? value.slice(0, MAX_VARIABLE_LENGTH) : value;

/** "+14156057073" -> "+1; 4 1 5; 6 0 5; 7 0 7 3", the grouping Fish uses for system.caller_number_spoken. */
export function spokenNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const spaced = (value: string) => value.split("").join(" ");
  if (e164.startsWith("+1") && digits.length === 11) return `+1; ${spaced(digits.slice(1, 4))}; ${spaced(digits.slice(4, 7))}; ${spaced(digits.slice(7))}`;
  return `+${digits.slice(0, Math.max(1, digits.length - 10))}; ${spaced(digits.slice(-10, -7))}; ${spaced(digits.slice(-7, -4))}; ${spaced(digits.slice(-4))}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function ordinal(day: number) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th"}`;
}

/** "2026-09-14" -> "September 14th" (no timezone conversion). */
export function spokenDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${ordinal(Number(match[3]))}` : iso;
}

const spokenAmount = (amount: number) => `${amount.toLocaleString("en-US")} ${amount === 1 ? "dollar" : "dollars"}`;

/**
 * Per-call values for {{placeholders}} in the published Fish agent. Built only from the case's
 * scenario and server config. It deliberately omits the invoice number and the flagged charge,
 * which are unknown until the bill arrives.
 */
export function buildDynamicVariables(providerName: string, config: Pick<FishDemoConfig, "guardianLine">): FishDynamicVariables {
  const scenario = scenarioForProvider(providerName);
  if (!scenario) throw new FishConfigError([`no demo scenario for ${providerName}`]);
  const encounter = scenario.records.find((record) => record.type === "encounter");
  const variables: FishDynamicVariables = {
    patient_name: `${scenario.patient.firstName} ${scenario.patient.lastName}`,
    hospital_name: scenario.hospital.name,
    payment_amount: spokenAmount(scenario.transaction.amount),
    payment_date: spokenDate(scenario.transaction.date),
    service_date: spokenDate(encounter?.date ?? scenario.transaction.date),
    guardian_line: config.guardianLine,
    guardian_line_spoken: spokenNumber(config.guardianLine),
  };
  for (const [name, value] of Object.entries(variables)) {
    if (!VARIABLE_NAME.test(name)) throw new Error(`Invalid Fish variable name ${name}`);
    variables[name] = cap(value);
  }
  return variables;
}

/** Plain-language description of what the AI will say and ask, shown on the authorization panel. */
export function callBrief(variables: FishDynamicVariables): string[] {
  return [
    `Introduces itself as an automated assistant from Medical Bill Guardian calling for ${variables.patient_name}.`,
    "Says this is a demonstration call with fictional data.",
    `Mentions the ${variables.payment_amount} payment to ${variables.hospital_name} on ${variables.payment_date}, for the ${variables.service_date} visit.`,
    "Asks for an itemized bill for the visit, with charges, service dates, and codes.",
    `Asks them to text the bill as a PDF link to ${variables.guardian_line_spoken}, and reads the number back to confirm.`,
    "Shares no real health or financial details, agrees to no payments or settlements, and ends politely.",
  ];
}
