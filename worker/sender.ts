/**
 * Provider identity beyond the From address: Cloudflare Email Routing evaluates SPF/DKIM/DMARC and
 * records them (ARC-)Authentication-Results from mx.cloudflare.net. A From header is trivially forged
 * and gmail.com's DMARC policy is lenient, so ingestion requires an explicit dmarc=pass aligned with
 * the sender's domain. Results added by any other server are ignored.
 */
export function verifiedSender(headers: Headers, from: string): { ok: true } | { ok: false; reason: string } {
  const domain = from.split("@").pop()?.toLowerCase() ?? "";
  const results = ["authentication-results", "arc-authentication-results"]
    .map((name) => headers.get(name) ?? "")
    .flatMap((value) => value.split(/,\s*(?=(?:i=\d+;\s*)?mx\.cloudflare\.net)/))
    .filter((value) => /^(?:i=\d+;\s*)?mx\.cloudflare\.net\b/i.test(value.trim()));
  if (!results.length) return { ok: false, reason: "No Cloudflare authentication results" };
  const aligned = results.some((value) => /\bdmarc=pass\b/i.test(value) && new RegExp(`header\\.from=${domain.replace(/\./g, "\\.")}\\b`, "i").test(value));
  return aligned ? { ok: true } : { ok: false, reason: `DMARC did not pass for ${domain}` };
}
