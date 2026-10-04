const URL_PATTERN = /https:\/\/[^\s<>"')\]]+/g;

export interface LinkOptions { allowedHosts?: string[]; fetcher?: (url: string, init: RequestInit) => Promise<Response>; maxBytes?: number }

/** BILL_PDF_ALLOWED_HOSTS: comma-separated exact hostnames a reply may link a PDF from. */
export const allowedPdfHosts = (value: string | undefined) => (value ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);

/** The single https link in a reply body that points at an allowed host, if exactly one does. */
export function linkedPdfUrl(body: string, allowedHosts: string[]): string | null {
  const candidates = [...new Set(body.match(URL_PATTERN) ?? [])].filter((raw) => {
    try { const url = new URL(raw); return !url.username && !url.password && allowedHosts.includes(url.hostname.toLowerCase()); }
    catch { return false; }
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/** Downloads a linked PDF: allowed host only, no redirects, bounded size, PDF content. */
export async function fetchLinkedPdf(url: string, options: LinkOptions): Promise<Uint8Array> {
  const fetcher = options.fetcher ?? ((target, init) => fetch(target, init));
  const maxBytes = options.maxBytes ?? 4_000_000;
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "medical-bill-guardian/1.0" } });
  if (!response.ok || !response.body) throw new Error(`PDF link request failed (${response.status})`);
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/pdf" && type !== "application/octet-stream") throw new Error(`PDF link returned ${type || "no content type"}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) { await reader.cancel(); throw new Error("Linked PDF is too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
