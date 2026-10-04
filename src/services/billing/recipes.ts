/**
 * How each FinchNode demo patient's itemized statement is put together. A recipe names the real
 * encounter to bill and the charges to list. `terms` are the lowercase words reconcile() looks for
 * in the retrieved record names ("=" at the start means the whole record name must equal the rest).
 * The statement generator builds the bill from the live pull and refuses to emit a line unless
 * `terms` find a real record on the service date, except lines marked `unsupported`, which it
 * refuses to emit if a record DOES support them. Prices are fictional chargemaster-style amounts.
 * This module has no imports so scripts can load it directly.
 */
export interface RecipeLine {
  description: string;
  /** CPT or HCPCS code number only. */
  code: string;
  amount: number;
  terms: string[];
  /** A charge that has no matching clinical record in the pull; the app must ask billing about it, never call it invalid. */
  unsupported?: boolean;
}

export interface StatementRecipe {
  scenarioId: string;
  /** FinchNode public demo subject. */
  subject: string;
  /** Organization named by the records themselves, without the "(Synthetic)" suffix. */
  organization: string;
  /** The latest encounter of this type is the billed visit; its date is the service date. */
  encounterType: string;
  invoice: string;
  lines: RecipeLine[];
}

const ecg: RecipeLine = { description: "Electrocardiogram, 12-lead", code: "93000", amount: 0, terms: ["electrocardiogram", "ecg", "ekg"], unsupported: true };

export const recipes: StatementRecipe[] = [
  {
    scenarioId: "morgan-wellness",
    subject: "patient-demo-001",
    organization: "Northstar Health System",
    encounterType: "Annual wellness visit",
    invoice: "NS-71802",
    lines: [
      { description: "Annual wellness visit, established patient", code: "99395", amount: 425, terms: ["annual wellness visit"] },
      { description: "Metabolic monitoring panel", code: "80048", amount: 118, terms: ["metabolic monitoring panel", "=glucose", "=creatinine", "=potassium"] },
      { description: "Hemoglobin A1c", code: "83036", amount: 94, terms: ["hemoglobin a1c"] },
      { description: "LDL cholesterol", code: "83721", amount: 82, terms: ["ldl cholesterol"] },
      { description: "Hemoglobin", code: "85018", amount: 41, terms: ["=hemoglobin"] },
      { description: "Metformin 500 mg tablet, administered at visit", code: "99070", amount: 32, terms: ["metformin 500 mg"] },
      { ...ecg, amount: 310 }
    ]
  },
  {
    scenarioId: "harriet-kidney",
    subject: "patient-demo-polypharmacy",
    organization: "Northstar Health System",
    encounterType: "Primary care follow-up",
    invoice: "NS-58417",
    lines: [
      { description: "Primary care follow-up visit, established patient", code: "99214", amount: 310, terms: ["primary care follow-up"] },
      { description: "Renal function panel", code: "80069", amount: 112, terms: ["kidney function draw", "creatinine [", "urea nitrogen", "glomerular filtration"] },
      { description: "Hemoglobin A1c", code: "83036", amount: 94, terms: ["hemoglobin a1c"] },
      { description: "Lipid panel", code: "80061", amount: 128, terms: ["cholesterol in ldl", "cholesterol in hdl", "triglyceride"] },
      { description: "Thyroid stimulating hormone (TSH)", code: "84443", amount: 86, terms: ["thyrotropin"] },
      { description: "Venipuncture, blood draw", code: "36415", amount: 24, terms: ["kidney function draw"] },
      { ...ecg, amount: 210 }
    ]
  },
  {
    scenarioId: "theo-asthma",
    subject: "patient-demo-pediatric-asthma",
    organization: "Northstar Health System",
    encounterType: "Asthma follow-up",
    invoice: "NS-33096",
    lines: [
      { description: "Asthma follow-up visit, established patient", code: "99214", amount: 275, terms: ["asthma follow-up"] },
      { description: "Pulse oximetry", code: "94760", amount: 38, terms: ["pulse oximetry"] },
      { description: "Inhaler technique evaluation", code: "94664", amount: 64, terms: ["metered dose inhaler"] },
      { description: "Albuterol inhaler, clinic-supplied", code: "99070", amount: 58, terms: ["albuterol"] },
      { description: "Fluticasone inhaler, clinic-supplied", code: "99070", amount: 72, terms: ["fluticasone"] }
    ]
  }
];

/** Search terms by exact bill-line description, for reconcile(). */
export const recipeTerms: Record<string, string[]> = {};
for (const line of recipes.flatMap((recipe) => recipe.lines)) {
  const existing = recipeTerms[line.description];
  // The same description may appear on several patients' bills only if it means the same thing.
  if (existing && existing.join("|") !== line.terms.join("|")) throw new Error(`Bill line "${line.description}" has conflicting search terms across recipes`);
  recipeTerms[line.description] = line.terms;
}
