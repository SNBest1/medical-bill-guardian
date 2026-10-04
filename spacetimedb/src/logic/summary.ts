import { formatDollars } from "./money";
import type { ResolutionInput } from "./types";

/** Builds the patient-facing summary from verified case facts only. */
export function buildSummary(input: { provider: string; supported: number; questioned: { description: string; amountCents: number }[]; resolution: ResolutionInput | null }): string {
  const { provider, supported, questioned, resolution } = input;
  const parts = [`We reviewed your ${provider} bill and compared its charges with your available medical records.`, `${supported} ${supported === 1 ? "service had" : "services had"} supporting records.`];
  if (questioned.length) parts.push(`We could not verify ${questioned.map((item) => `${item.description} (${formatDollars(item.amountCents)})`).join(", ")} from those records, so we asked hospital billing to review ${questioned.length === 1 ? "it" : "them"}.`);
  if (resolution) parts.push(`${resolution.explanation} The bill changed from ${formatDollars(resolution.originalTotalCents)} to ${formatDollars(resolution.correctedTotalCents)}${resolution.adjustmentCents > 0 ? `, a ${formatDollars(resolution.adjustmentCents)} correction` : ""}.`);
  return parts.join(" ");
}
