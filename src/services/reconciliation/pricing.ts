import { existsSync, readFileSync, statSync } from "node:fs";
import type { Finding, InsuranceContext, ItemizedBill, PriceComparison } from "../../types/domain";

export interface PriceReference extends Omit<PriceComparison, "multiple"> {
  code: string;
  provider: string;
  validFrom: string;
  validThrough: string;
  payer?: string;
  plan?: string;
  units: number;
  setting: "INPATIENT" | "OUTPATIENT";
  component: "FACILITY" | "PROFESSIONAL" | "GLOBAL";
  modifiers: string[];
}

/** Optional curated, source-backed rates. Missing references never become invented prices. */
export function loadPriceReferences(): PriceReference[] {
  const path = "./data/pricing-references.json";
  if (!existsSync(path)) return [];
  if (statSync(path).size > 65536) throw new Error("Price reference file is too large");
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(value) || !value.every((item) => item && typeof item === "object" && typeof item.code === "string" && item.code.length > 0 && typeof item.provider === "string" && typeof item.referenceAmount === "number" && Number.isFinite(item.referenceAmount) && item.referenceAmount > 0 && typeof item.sourceName === "string" && item.sourceName.length > 0 && typeof item.sourceUrl === "string" && /^https:\/\//.test(item.sourceUrl) && ["CASH", "NEGOTIATED", "MEDICARE"].includes(item.basis) && [item.asOf, item.validFrom, item.validThrough].every((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) && item.validFrom <= item.validThrough)) throw new Error("Price references need procedure codes, provider, positive rates, source, basis, and valid dates");
  return value as PriceReference[];
}

/** Compare only a unique matching provider/code/date rate. A price difference is a review lead. */
export function comparePrices(bill: ItemizedBill, findings: Finding[], references: PriceReference[], insurance?: InsuranceContext): Finding[] {
  return findings.map((finding) => {
    const item = bill.items.find((entry) => entry.id === finding.billItemId);
    if (!item?.code || !insurance || insurance.coverage === "UNKNOWN") return finding;
    const matches = references.filter((reference) => {
      if (!Number.isFinite(reference.units) || reference.units <= 0 || !reference.setting || !reference.component || !Array.isArray(reference.modifiers)) return false;
      if (reference.provider !== bill.provider || reference.code !== item.code || item.serviceDate < reference.validFrom || item.serviceDate > reference.validThrough) return false;
      if (reference.units !== undefined && item.units !== reference.units) return false;
      if (reference.setting !== undefined && item.setting !== reference.setting) return false;
      if (reference.component !== undefined && item.component !== reference.component) return false;
      if (reference.modifiers !== undefined && JSON.stringify([...reference.modifiers].sort()) !== JSON.stringify([...(item.modifiers ?? [])].sort())) return false;
      if (insurance?.coverage === "INSURED") return reference.basis === "NEGOTIATED" && insurance.network === "IN_NETWORK" && Boolean(insurance.payer && insurance.plan) && reference.payer === insurance.payer && reference.plan === insurance.plan;
      if (insurance?.coverage === "UNKNOWN") return false;
      return reference.basis === "CASH";
    });
    if (matches.length !== 1) return finding;
    const rate = matches[0];
    const multiple = item.amount / rate.referenceAmount;
    const review = multiple >= 2;
    return { ...finding, pricingStatus: review ? "REVIEW" : "ASSESSED", priceComparison: { referenceAmount: rate.referenceAmount, multiple, sourceName: rate.sourceName, sourceUrl: rate.sourceUrl, basis: rate.basis, asOf: rate.asOf }, action: review ? "REQUEST_REVIEW" : finding.action };
  });
}
