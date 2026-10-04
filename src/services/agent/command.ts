import { scenarios, type Scenario } from "../scenarios";

const keywords: Record<string, string[]> = {
  "bike-wrist": ["wrist", "cycling", "cyclist", "bike", "bicycle", "fracture", "broken"],
  "car-concussion": ["concussion", "collision", "rear", "car", "neck", "whiplash"],
  "ski-ankle": ["ski", "skiing", "ankle", "sprain", "sprained"]
};

export type CommandResult =
  | { kind: "match"; scenario: Scenario }
  | { kind: "ambiguous"; options: Scenario[] }
  | { kind: "unknown" };

/** Works out which patient's bill a typed or spoken instruction refers to. A patient name or hospital
 * is a strong match; injury words are weaker. Deterministic on purpose: it only chooses among the
 * three known cases and never invents one. */
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
