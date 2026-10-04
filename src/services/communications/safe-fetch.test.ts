import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SafeFetchError, billFetchOptions, fetchBillPdf, isDisallowedAddress, redactUrl, validateBillUrl, type DnsLookup } from "./safe-fetch";

const pdf = Buffer.from("%PDF-1.4\nfake body for tests");
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://x").pathname;
    if (path === "/ok.pdf") { response.writeHead(200, { "content-type": "application/pdf" }); return void response.end(pdf); }
    if (path === "/magic.pdf") { response.writeHead(200, { "content-type": "application/octet-stream" }); return void response.end(pdf); }
    if (path === "/html.pdf") { response.writeHead(200, { "content-type": "text/html" }); return void response.end("<html>not a pdf</html>"); }
    if (path === "/big.pdf") { response.writeHead(200, { "content-type": "application/pdf" }); return void response.end(Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(5000)])); }
    if (path === "/stream.pdf") { response.writeHead(200, { "content-type": "application/pdf" }); response.write("%PDF-"); for (let i = 0; i < 20; i++) response.write(Buffer.alloc(500)); return void response.end(); }
    if (path === "/hop1.pdf") { response.writeHead(302, { location: "/ok.pdf" }); return void response.end(); }
    if (path === "/loop.pdf") { response.writeHead(302, { location: "/loop.pdf" }); return void response.end(); }
    if (path === "/other-host.pdf") { response.writeHead(302, { location: `http://localhost:${(server.address() as AddressInfo).port}/ok.pdf` }); return void response.end(); }
    if (path === "/slow.pdf") return; // never answers
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

const local = { allowedHosts: ["127.0.0.1", "localhost"], allowLocalhost: true };
const code = async (promise: Promise<unknown>) => promise.then(() => "ok", (error: SafeFetchError) => error.code);

describe("safe bill fetch", () => {
  it("downloads an allowlisted PDF and accepts %PDF- bytes under a generic content type", async () => {
    expect((await fetchBillPdf(`${base}/ok.pdf`, local)).equals(pdf)).toBe(true);
    expect((await fetchBillPdf(`${base}/magic.pdf`, local)).equals(pdf)).toBe(true);
  });

  it("rejects everything by default, and any host that is not on the allowlist", async () => {
    expect(billFetchOptions({} as unknown as NodeJS.ProcessEnv).allowedHosts).toEqual([]);
    expect(await code(fetchBillPdf(`${base}/ok.pdf`, { ...local, allowedHosts: [] }))).toBe("host_not_allowed");
    expect(await code(fetchBillPdf("https://evil.example.test/bill.pdf", { allowedHosts: ["bills.example.test"] }))).toBe("host_not_allowed");
    expect(await code(fetchBillPdf(`${base}/ok.pdf`, { allowedHosts: ["127.0.0.1"], allowLocalhost: false }))).toBe("protocol");
    expect(billFetchOptions({ GUARDIAN_BILL_HOSTS: " Bills.Example.test , files.example.test " } as unknown as NodeJS.ProcessEnv).allowedHosts).toEqual(["bills.example.test", "files.example.test"]);
  });

  it("requires https, rejects credentials and unusual ports for public hosts", () => {
    const options = { allowedHosts: ["bills.example.test"] };
    expect(() => validateBillUrl("http://bills.example.test/a.pdf", options)).toThrow(/https/);
    expect(() => validateBillUrl("https://user:pw@bills.example.test/a.pdf", options)).toThrow(/credentials/);
    expect(() => validateBillUrl("https://bills.example.test:8443/a.pdf", options)).toThrow(/port/);
    expect(validateBillUrl("https://bills.example.test/a.pdf?sig=abc", options).hostname).toBe("bills.example.test");
  });

  it("follows same-host redirects but refuses other hosts and long chains", async () => {
    expect((await fetchBillPdf(`${base}/hop1.pdf`, local)).equals(pdf)).toBe(true);
    expect(await code(fetchBillPdf(`${base}/other-host.pdf`, local))).toBe("redirect");
    expect(await code(fetchBillPdf(`${base}/loop.pdf`, local))).toBe("redirect");
  });

  it("enforces the size cap, content type, and a timeout", async () => {
    expect(await code(fetchBillPdf(`${base}/big.pdf`, { ...local, maxBytes: 1000 }))).toBe("too_large");
    expect(await code(fetchBillPdf(`${base}/stream.pdf`, { ...local, maxBytes: 2000 }))).toBe("too_large");
    expect(await code(fetchBillPdf(`${base}/html.pdf`, local))).toBe("content_type");
    expect(await code(fetchBillPdf(`${base}/missing.pdf`, local))).toBe("status");
    expect(await code(fetchBillPdf(`${base}/slow.pdf`, { ...local, timeoutMs: 250 }))).toBe("timeout");
  });

  it("rejects hosts that resolve to private, loopback or link-local addresses at connect time", async () => {
    for (const address of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "192.168.1.9", "::1", "fe80::1", "::ffff:10.0.0.1", "fd00::1"]) {
      const lookup: DnsLookup = (_host, _options, callback) => callback(null, [{ address, family: address.includes(":") ? 6 : 4 }]);
      expect(await code(fetchBillPdf("https://bills.example.test/a.pdf", { allowedHosts: ["bills.example.test"], lookup }))).toBe("private_address");
    }
  });

  it("classifies addresses", () => {
    for (const bad of ["0.0.0.0", "10.1.2.3", "127.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.1.1", "100.64.0.1", "224.0.0.1", "::", "::1", "fc00::1", "fe80::abcd", "ff02::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "nonsense"]) expect(isDisallowedAddress(bad), bad).toBe(true);
    for (const good of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"]) expect(isDisallowedAddress(good), good).toBe(false);
  });

  it("never exposes the query string when describing a URL", () => {
    expect(redactUrl("https://bills.example.test/a/b.pdf?token=SECRET#frag")).toBe("https://bills.example.test/a/b.pdf");
    expect(redactUrl("garbage")).toBe("(invalid url)");
  });
});
