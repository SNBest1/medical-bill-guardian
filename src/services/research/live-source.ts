import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ResearchCatalog } from "./price-research";

const execute = promisify(execFile);
export const PUBLISHER_URL = "https://www.uofmhealth.org/386006309_university-of-michigan-health_standardcharges4-1-2026.zip";

/** Fetch an allowlisted public publisher, extract a single exact code into an isolated temp directory. */
export async function fetchLiveCatalog(code: string, fetcher: typeof fetch = fetch): Promise<ResearchCatalog> {
  if (!/^[A-Z0-9]{5}$/.test(code)) throw new Error("Invalid procedure code");
  const response = await fetcher(PUBLISHER_URL, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error(`Publisher request failed (${response.status})`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > 25 * 1024 * 1024) throw new Error("Publisher archive exceeds research size limit");
      chunks.push(result.value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const bytes = Buffer.concat(chunks);
  const directory = await mkdtemp(join(tmpdir(), "guardian-price-research-"));
  try {
    const archive = join(directory, "source.zip");
    const output = join(directory, "catalog.json");
    await writeFile(archive, bytes);
    // Bound archive expansion before invoking the existing, streaming hospital importer.
    await execute("python3", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert len(z.infolist()) <= 10; assert sum(f.file_size for f in z.infolist()) <= 512*1024*1024", archive], { timeout: 5000 });
    await execute("python3", [resolve("scripts/import-hospital-prices.py"), "--zip", archive, "--codes", code, "--output", output], { timeout: 30000, maxBuffer: 65536 });
    const catalog = JSON.parse(await readFile(output, "utf8")) as ResearchCatalog;
    if (catalog.sourceUrl !== PUBLISHER_URL || catalog.sourceSha256 !== createHash("sha256").update(bytes).digest("hex")) throw new Error("Research source provenance mismatch");
    return catalog;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
