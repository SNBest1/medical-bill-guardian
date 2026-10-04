import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * SSRF-defended downloader for the PDF a hospital texts us. The sender is only partially trusted
 * (the text policy checks the phone number, not the link), so every hop is checked here:
 * https only, host on an explicit allowlist, no userinfo or odd ports, redirects limited to the same
 * host, every resolved address public, bounded time and size, and PDF content only.
 */
export class SafeFetchError extends Error {
  constructor(readonly code: "protocol" | "host_not_allowed" | "bad_url" | "private_address" | "redirect" | "timeout" | "too_large" | "status" | "content_type" | "network", message: string) { super(message); }
}

export type DnsLookup = (hostname: string, options: dns.LookupAllOptions, callback: (error: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;
export interface SafeFetchOptions {
  allowedHosts: string[];
  /** Test/rehearsal only: permits plain http and loopback addresses, and only for an allowlisted local host name. */
  allowLocalhost?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  lookup?: DnsLookup;
}

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const LOCAL_NAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Reads the allowlist (default empty = reject everything). Local hosts are honored only in tests or with an explicit rehearsal flag. */
export function billFetchOptions(env: NodeJS.ProcessEnv = process.env): SafeFetchOptions {
  return {
    allowedHosts: (env.GUARDIAN_BILL_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
    allowLocalhost: env.NODE_ENV === "test" || env.GUARDIAN_BILL_ALLOW_LOCALHOST === "true"
  };
}

/** Origin plus path only: query strings and fragments can carry secrets and are never logged. */
export function redactUrl(url: URL | string): string {
  try { const parsed = typeof url === "string" ? new URL(url) : url; return `${parsed.protocol}//${parsed.host}${parsed.pathname}`; }
  catch { return "(invalid url)"; }
}

const bareHost = (host: string) => host.replace(/^\[|\]$/g, "");

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unspecified addresses (IPv4, IPv6, v4-mapped). */
export function isDisallowedAddress(address: string): boolean {
  const ip = bareHost(address).toLowerCase();
  const family = net.isIP(ip);
  if (family === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (family === 6) {
    const mapped = /^(?:0{0,4}:){0,5}(?:ffff:)(\d+\.\d+\.\d+\.\d+)$/.exec(ip) ?? /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isDisallowedAddress(mapped[1]);
    const hextets = expandIpv6(ip);
    if (!hextets) return true;
    const [first] = hextets;
    if (hextets.every((part) => part === 0) || (hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1)) return true;
    if ((first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00 || (first & 0xff00) === 0xff00) return true;
    if (first === 0x64 && hextets[1] === 0xff9b) return true; // NAT64 can reach IPv4 private ranges
    if (hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff) return isDisallowedAddress(`${hextets[6] >> 8}.${hextets[6] & 255}.${hextets[7] >> 8}.${hextets[7] & 255}`);
    return false;
  }
  return true; // not an IP at all
}

function expandIpv6(ip: string): number[] | null {
  let value = ip;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (v4) { const [a, b, c, d] = v4[1].split(".").map(Number); value = value.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`; }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const parts = [...head, ...Array(fill).fill("0"), ...tail].map((part) => parseInt(part, 16));
  return parts.length === 8 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff) ? parts : null;
}

/** Validates scheme, credentials, port and host allowlist for one URL (initial or redirect target). */
export function validateBillUrl(raw: string | URL, options: SafeFetchOptions): URL {
  let url: URL;
  try { url = typeof raw === "string" ? new URL(raw) : raw; } catch { throw new SafeFetchError("bad_url", "The bill link is not a valid URL"); }
  const host = url.hostname.toLowerCase();
  const local = LOCAL_NAMES.has(host);
  if (url.username || url.password) throw new SafeFetchError("bad_url", "Bill links may not contain credentials");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local && options.allowLocalhost)) throw new SafeFetchError("protocol", "Bill links must use https");
  if (!options.allowedHosts.includes(host) && !options.allowedHosts.includes(bareHost(host))) throw new SafeFetchError("host_not_allowed", `Host ${host} is not on the bill host allowlist`);
  if (local && !options.allowLocalhost) throw new SafeFetchError("private_address", "Local hosts are not allowed for bill links");
  if (!local && url.port && url.port !== "443") throw new SafeFetchError("bad_url", "Bill links must use the default https port");
  if (net.isIP(bareHost(host)) && !local && isDisallowedAddress(host)) throw new SafeFetchError("private_address", "Bill links may not point at a private address");
  return url;
}

function responseFor(url: URL, options: SafeFetchOptions, deadline: { remaining(): number }, maxBytes: number): Promise<{ status: number; location?: string; body: Buffer; contentType: string }> {
  const local = LOCAL_NAMES.has(url.hostname.toLowerCase());
  // The address check runs at connect time inside the socket's own lookup, so a hostname cannot be
  // validated against one DNS answer and then connected to another (DNS rebinding).
  const vettedLookup = (hostname: string, lookupOptions: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
    const resolve = options.lookup ?? ((name, opts, cb) => dns.lookup(name, opts, cb));
    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error);
      if (!addresses.length || (!(local && options.allowLocalhost) && addresses.some((entry) => isDisallowedAddress(entry.address)))) return callback(new SafeFetchError("private_address", "The bill host resolves to a non-public address"));
      if ((lookupOptions as { all?: boolean }).all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request({ protocol: url.protocol, hostname: bareHost(url.hostname), port: url.port || undefined, path: `${url.pathname}${url.search}`, method: "GET", agent: false, lookup: vettedLookup as never, headers: { accept: "application/pdf", "user-agent": "medical-bill-guardian" } }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) { response.resume(); return resolve({ status, location: response.headers.location, body: Buffer.alloc(0), contentType: "" }); }
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes) { const error = new SafeFetchError("too_large", "The bill PDF is larger than the 5 MB limit"); request.destroy(error); return reject(error); }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) { const error = new SafeFetchError("too_large", "The bill PDF is larger than the 5 MB limit"); request.destroy(error); reject(error); return; } chunks.push(chunk); });
      response.on("end", () => resolve({ status, body: Buffer.concat(chunks), contentType: String(response.headers["content-type"] ?? "") }));
      response.on("error", reject);
    });
    request.on("error", (error) => reject(error instanceof SafeFetchError ? error : new SafeFetchError("network", `The bill could not be downloaded (${(error as NodeJS.ErrnoException).code ?? "network error"})`)));
    const timer = setTimeout(() => request.destroy(new SafeFetchError("timeout", "Downloading the bill timed out")), Math.max(1, deadline.remaining()));
    request.on("close", () => clearTimeout(timer));
    request.end();
  });
}

/** Downloads one bill PDF under all of the limits above and returns its bytes. */
export async function fetchBillPdf(raw: string, options: SafeFetchOptions): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? MAX_PDF_BYTES;
  const started = Date.now();
  const total = options.timeoutMs ?? 10_000;
  const deadline = { remaining: () => total - (Date.now() - started) };
  let url = validateBillUrl(raw, options);
  const originalHost = url.hostname.toLowerCase();
  const maxRedirects = options.maxRedirects ?? 3;
  for (let hop = 0; ; hop++) {
    if (deadline.remaining() <= 0) throw new SafeFetchError("timeout", "Downloading the bill timed out");
    const result = await responseFor(url, options, deadline, maxBytes);
    if (result.status >= 300 && result.status < 400) {
      if (hop >= maxRedirects || !result.location) throw new SafeFetchError("redirect", "Too many redirects while downloading the bill");
      let next: URL;
      try { next = new URL(result.location, url); } catch { throw new SafeFetchError("redirect", "The bill link redirected to an invalid location"); }
      if (next.hostname.toLowerCase() !== originalHost) throw new SafeFetchError("redirect", "The bill link redirected to a different host");
      url = validateBillUrl(next, options);
      continue;
    }
    if (result.status !== 200) throw new SafeFetchError("status", `The bill host answered ${result.status}`);
    const isPdf = /^application\/pdf\b/i.test(result.contentType) || result.body.subarray(0, 5).toString("latin1") === "%PDF-";
    if (!isPdf) throw new SafeFetchError("content_type", "The link did not return a PDF");
    if (!result.body.length) throw new SafeFetchError("content_type", "The PDF was empty");
    return result.body;
  }
}
