import type { MedicalRecord } from "../../types/domain";
import { matchesServiceWindow, normalizeFinchRecords, type FinchSnapshot } from "../medical/finchnode.ts";
import type { RecipeLine, StatementRecipe } from "./recipes.ts";

export interface BuiltLine { description: string; code: string; amount: number; unsupported: boolean; evidence: Array<{ id: string; category: string; name: string }> }
export interface BuiltStatement {
  scenarioId: string;
  subject: string;
  serviceDate: string;
  encounter: { id: string; type: string };
  invoice: string;
  total: number;
  lines: BuiltLine[];
  /** Plain-text statement in the grammar parseItemizedBill reads. */
  statement: string;
}

const hit = (record: MedicalRecord, term: string) => {
  const name = record.description.toLowerCase();
  return term.startsWith("=") ? name === term.slice(1) : name.includes(term);
};
const money = (value: number) => value.toFixed(2);

/**
 * Builds a patient's itemized statement from a FinchNode records response: the latest encounter of
 * the recipe's type sets the service date, only that date's records (provider matched, +/- 1 day
 * window) can back a charge, and every charge except the deliberately unsupported one must be
 * backed by at least one of them. Throws instead of emitting a bill the records do not justify.
 */
export function buildStatement(recipe: StatementRecipe, snapshot: FinchSnapshot): BuiltStatement {
  const records = normalizeFinchRecords(snapshot);
  const encounter = records
    .filter((record) => record.type === "encounter" && record.description === recipe.encounterType && matchesServiceWindow(record, recipe.organization, record.date, 0))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!encounter) throw new Error(`${recipe.subject}: no "${recipe.encounterType}" encounter from ${recipe.organization} in the FinchNode records`);
  const serviceDate = encounter.date;
  const sameDay = records.filter((record) => record.date === serviceDate && matchesServiceWindow(record, recipe.organization, serviceDate, 1));

  const lines = recipe.lines.map((line: RecipeLine): BuiltLine => {
    const backing = sameDay.filter((record) => line.terms.some((term) => hit(record, term)));
    if (line.unsupported && backing.length) throw new Error(`${recipe.subject}: "${line.description}" is meant to be unsupported but ${backing.map((record) => `"${record.description}"`).join(", ")} backs it`);
    if (!line.unsupported && !backing.length) throw new Error(`${recipe.subject}: no FinchNode record on ${serviceDate} backs "${line.description}"`);
    return { description: line.description, code: line.code, amount: line.amount, unsupported: Boolean(line.unsupported), evidence: backing.map((record) => ({ id: record.id, category: record.category ?? record.type, name: record.description })) };
  });
  const total = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0) / 100;
  const statement = [
    `Invoice: ${recipe.invoice}`,
    `Provider: ${recipe.organization}`,
    `Service date: ${serviceDate}`,
    "Insurance adjustments: 0.00",
    `Patient responsibility: ${money(total)}`,
    "Charges",
    ...lines.map((line) => `${line.description} | ${line.code} | ${money(line.amount)}`),
    `Total: ${money(total)}`
  ].join("\n");
  return { scenarioId: recipe.scenarioId, subject: recipe.subject, serviceDate, encounter: { id: encounter.id, type: encounter.description }, invoice: recipe.invoice, total, lines, statement };
}
