import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Account ID saved by scripts/nessie-seed.mjs for a scenario's patient, if that scenario was seeded. */
export function seededNessieAccount(scenarioId: string): string | null {
  const path = resolve(process.cwd(), "data/nessie-seed.json");
  if (!existsSync(path)) return null;
  const entry = JSON.parse(readFileSync(path, "utf8"))[scenarioId] as { accountId?: string } | undefined;
  return entry?.accountId ?? null;
}
