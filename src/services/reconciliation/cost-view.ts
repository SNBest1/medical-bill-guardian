import type { MedicalBillCase } from "../../types/domain";
import benchmarks from "../../../reference-data/cms-lab-benchmarks.json";
import { comparePrices, loadPriceReferences, type PriceReference } from "./pricing";
import { loadResearchCatalog } from "../research/price-research";

export function costView(c: MedicalBillCase, references: PriceReference[] = loadPriceReferences()) {
  if (!c.bill) return [];
  const findings = comparePrices(c.bill, c.findings, references, c.insurance);
  const catalog = loadResearchCatalog();
  return c.bill.items.map((item) => {
    const comparison = findings.find((f) => f.billItemId === item.id)?.priceComparison;
    const cms = benchmarks.find((b) => b.code === item.code && b.validFrom <= item.serviceDate && b.validThrough >= item.serviceDate);
    // These are contextual cash rates from another hospital, never this patient's contract.
    const michigan = catalog.records.filter((r) => r.basis === "CASH" && r.codes.some((code) => code.code === item.code) && r.methodology === "discounted cash" && Number.isFinite(r.amount) && r.amount > 0);
    return {
      id: item.id, description: item.description, code: item.code, charged: item.amount,
      expected: comparison?.referenceAmount ?? null,
      expectedSource: comparison ? { name: comparison.sourceName, url: comparison.sourceUrl, basis: comparison.basis, asOf: comparison.asOf } : null,
      difference: comparison ? Math.round((item.amount - comparison.referenceAmount) * 100) / 100 : null,
      benchmark: cms ? { amount: cms.amount, unit: cms.unit, name: cms.sourceName, url: cms.sourcePage, validFrom: cms.validFrom, validThrough: cms.validThrough } : null,
      michigan: michigan.length ? { low: Math.min(...michigan.map((r) => r.amount)), high: Math.max(...michigan.map((r) => r.amount)), name: catalog.sourceName, url: catalog.sourcePage, asOf: michigan[0].asOf } : null,
      missing: comparison ? [] : ["Applicable hospital cash rate or insurer contract", ...(!item.units ? ["Billing units"] : []), ...(!item.setting ? ["Care setting"] : []), ...(!item.component ? ["Facility/professional component"] : []), ...(c.insurance?.coverage === "INSURED" ? ["Matching payer, plan and final EOB"] : [])],
    };
  });
}
