/** Converts a validated decimal string ("4820.00") to integer cents without floating-point rounding. */
export function toCents(text: string): number {
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

/** Formats cents as dollars; avoids Intl because SpacetimeDB modules may not provide it. */
export function formatDollars(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = cents % 100;
  return rest ? `$${whole}.${rest.toString().padStart(2, "0")}` : `$${whole}`;
}
