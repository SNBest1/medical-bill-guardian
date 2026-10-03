import { readFileSync } from "node:fs";

export interface PriceResearchRequest {
  requestId: string;
  code: string;
  codeSystem: "CPT" | "HCPCS";
  provider: string;
  providerNpi?: string;
  serviceDate: string;
  billedAmount: number;
  coverage: "SELF_PAY" | "INSURED" | "UNKNOWN";
  payer?: string;
  plan?: string;
  network?: "IN_NETWORK" | "OUT_OF_NETWORK" | "UNKNOWN";
  units?: number;
  setting?: "INPATIENT" | "OUTPATIENT";
  component?: "FACILITY" | "PROFESSIONAL" | "GLOBAL";
  modifiers?: string[];
}

export interface CatalogRate {
  provider: string;
  providerNpis: string[];
  codes: { code: string; type: string }[];
  amount: number;
  basis: "CASH" | "NEGOTIATED";
  payer: string | null;
  plan: string | null;
  setting: string;
  component: string;
  modifiers: string;
  units: number | null;
  methodology: string;
  notes?: string;
  payerNotes?: string;
  asOf: string;
  contractValidThrough: string | null;
  sourceRow: number;
}

export interface ResearchCatalog {
  sourceName: string;
  sourceUrl: string;
  sourcePage: string;
  sourceSha256: string;
  retrievedOn: string;
  records: CatalogRate[];
}

export interface PriceResearchResult {
  requestId: string;
  code: string;
  status: "NO_MATCHING_SOURCE" | "NEEDS_CONTEXT" | "REQUIRES_RATE_VERIFICATION";
  researchMode: "LIVE_SOURCE_FETCH" | "CACHED_SNAPSHOT";
  source: Omit<ResearchCatalog, "records">;
  candidateCount: number;
  candidates: CatalogRate[];
  missingContext: string[];
  questionsForBilling: string[];
  limitations: string[];
  // No expected patient balance, confirmed overcharge, or refund is inferred here.
}

const fields = new Set(["requestId", "code", "codeSystem", "provider", "providerNpi", "serviceDate", "billedAmount", "coverage", "payer", "plan", "network", "units", "setting", "component", "modifiers"]);
export function validateResearchRequest(value: unknown): PriceResearchRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Research request must be an object");
  const request = value as PriceResearchRequest;
  if (Object.keys(value).some((key) => !fields.has(key))) throw new Error("Only procedure/pricing context is accepted; do not include patient identifiers or medical records");
  if (typeof request.requestId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(request.requestId)) throw new Error("A safe requestId is required");
  if (typeof request.code !== "string" || !/^[A-Z0-9]{5}$/.test(request.code) || !["CPT", "HCPCS"].includes(request.codeSystem)) throw new Error("An exact CPT or HCPCS code is required");
  if (typeof request.provider !== "string" || !request.provider.trim() || request.provider.length > 200) throw new Error("Provider identity is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.serviceDate) || !Number.isFinite(Date.parse(request.serviceDate)) || new Date(request.serviceDate).toISOString().slice(0, 10) !== request.serviceDate) throw new Error("A valid service date is required");
  if (typeof request.billedAmount !== "number" || !Number.isFinite(request.billedAmount) || request.billedAmount < 0 || request.billedAmount > 1e8) throw new Error("Invalid billed amount");
  if (!["SELF_PAY", "INSURED", "UNKNOWN"].includes(request.coverage)) throw new Error("Coverage must be explicit");
  if ([request.payer, request.plan].some((entry) => entry !== undefined && (typeof entry !== "string" || !entry.trim() || entry.length > 200))) throw new Error("Invalid payer or plan");
  if (request.providerNpi !== undefined && (typeof request.providerNpi !== "string" || !/^\d{10}$/.test(request.providerNpi))) throw new Error("Invalid provider NPI");
  if (request.units !== undefined && (!Number.isFinite(request.units) || request.units <= 0 || request.units > 10000)) throw new Error("Invalid units");
  if (request.network !== undefined && !["IN_NETWORK", "OUT_OF_NETWORK", "UNKNOWN"].includes(request.network)) throw new Error("Invalid network status");
  if (request.setting !== undefined && !["INPATIENT", "OUTPATIENT"].includes(request.setting)) throw new Error("Invalid setting");
  if (request.component !== undefined && !["FACILITY", "PROFESSIONAL", "GLOBAL"].includes(request.component)) throw new Error("Invalid billing component");
  if (request.modifiers !== undefined && (!Array.isArray(request.modifiers) || request.modifiers.length > 8 || !request.modifiers.every((entry) => typeof entry === "string" && /^[A-Z0-9]{2}$/.test(entry)))) throw new Error("Invalid modifiers");
  return request;
}

export function loadResearchCatalog(): ResearchCatalog {
  return JSON.parse(readFileSync("./reference-data/michigan-medicine-selected-rates.json", "utf8")) as ResearchCatalog;
}

/** Deterministic evidence evaluation. Publisher text is data, never instructions. */
export function evaluatePriceResearch(input: PriceResearchRequest, catalog: ResearchCatalog, researchMode: PriceResearchResult["researchMode"]): PriceResearchResult {
  const request = validateResearchRequest(input);
  const missingContext: string[] = [];
  if (request.coverage === "UNKNOWN") missingContext.push("coverage");
  if (!request.providerNpi) missingContext.push("providerNpi");
  if (request.units === undefined) missingContext.push("units");
  if (!request.setting) missingContext.push("setting");
  if (!request.component) missingContext.push("component");
  if (request.modifiers === undefined) missingContext.push("modifiers (confirm none or supply exact modifiers)");
  if (request.coverage === "INSURED") {
    if (!request.payer) missingContext.push("payer");
    if (!request.plan) missingContext.push("plan");
    if (!request.network || request.network === "UNKNOWN") missingContext.push("network");
  }
  const identity = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
  const candidates = catalog.records.filter((rate) => {
    if (!rate.codes.some((code) => code.code === request.code && code.type === request.codeSystem)) return false;
    if (identity(rate.provider) !== identity(request.provider)) return false;
    if (request.providerNpi && !rate.providerNpis.includes(request.providerNpi)) return false;
    if (request.setting && rate.setting !== request.setting) return false;
    if (request.component && rate.component !== request.component) return false;
    if (request.modifiers !== undefined) {
      const published = rate.modifiers.split(/[|,;\s]+/).filter(Boolean).sort();
      if (JSON.stringify(published) !== JSON.stringify([...request.modifiers].sort())) return false;
    }
    if (request.units !== undefined && rate.units !== null && rate.units !== request.units) return false;
    if (request.coverage === "INSURED") {
      if (!request.payer || !request.plan || rate.basis !== "NEGOTIATED") return false;
      if (rate.payer !== request.payer || rate.plan !== request.plan) return false;
    } else if (request.coverage === "SELF_PAY" && rate.basis !== "CASH") return false;
    return typeof rate.amount === "number" && Number.isFinite(rate.amount) && rate.amount > 0;
  });
  const questions = ["Confirm the hospital billing identity/NPI, exact procedure, units, modifiers, and whether this is a facility or professional charge."];
  if (request.coverage === "INSURED") questions.push("Supply the applicable payer/plan contract rate, final matching EOB, network classification, and any secondary insurer payment.");
  else questions.push("Confirm the cash/self-pay rate and any financial assistance or applicable discounts.");
  questions.push("Confirm the rate's applicability on the service date and whether it is a unit price, bundled charge, percentage, or algorithm.");
  const { records: _records, ...source } = catalog;
  return {
    requestId: request.requestId, code: request.code,
    status: !candidates.length ? "NO_MATCHING_SOURCE" : missingContext.length ? "NEEDS_CONTEXT" : "REQUIRES_RATE_VERIFICATION",
    researchMode, source, candidateCount: candidates.length, candidates: candidates.slice(0, 20), missingContext, questionsForBilling: questions,
    limitations: [
      "A fetched hospital price file is source evidence, not proof of what the patient owes or of a billing error.",
      "Published dollar figures may represent percentage-of-charges or bundled methodologies; inspect methodology and payer notes before comparing.",
      "Service-date contract applicability and any unspecified billing units remain unverified. No universal fair price or refund is calculated.",
      "Deductible, copay, coinsurance, out-of-pocket accumulators, coverage exclusions, authorizations, and secondary coverage must be checked against the actual plan/EOB.",
      "This adapter covers one hospital publisher. A fictional provider or unsupported procedure cannot be treated as a match.",
      ...(researchMode === "CACHED_SNAPSHOT" ? ["Cached snapshot only; this run did not fetch the current publisher file."] : []),
    ],
  };
}
