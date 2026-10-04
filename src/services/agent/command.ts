import { scenarios, type Scenario } from "../scenarios";

const keywords: Record<string, string[]> = {
  "morgan-wellness": ["wellness", "diabetes", "diabetic", "annual", "checkup", "metformin"],
  "harriet-kidney": ["kidney", "kidneys", "renal", "heart", "cardiac", "ckd", "afib", "senior"],
  "theo-asthma": ["asthma", "asthmatic", "child", "kid", "pediatric", "inhaler", "boy"]
};

export type CommandResult =
  | { kind: "match"; scenario: Scenario }
  | { kind: "ambiguous"; options: Scenario[] }
  | { kind: "unknown" };

/** Works out which patient's bill a typed or spoken instruction refers to. A patient name is a strong
 * match and a condition word is weaker. The hospital name is shared by all three patients, so it adds
 * the same points to each and can never pick one: "the Northstar bill" is ambiguous, "Morgan at
 * Northstar" is Morgan. Deterministic on purpose: it only chooses among the known cases and never invents one. */
export function resolveCommand(text: string): CommandResult {
  const words = new Set(text.toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z]+/).filter(Boolean));
  const scored = scenarios.map((scenario) => {
    const strong = [scenario.patient.firstName, scenario.patient.lastName, scenario.hospital.name.split(" ")[0]].filter((word) => words.has(word.toLowerCase())).length;
    const weak = (keywords[scenario.id] ?? []).filter((word) => words.has(word)).length;
    return { scenario, score: strong * 3 + weak };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: "unknown" };
  const top = scored.filter((entry) => entry.score === scored[0].score);
  return top.length === 1 ? { kind: "match", scenario: top[0].scenario } : { kind: "ambiguous", options: top.map((entry) => entry.scenario) };
}
