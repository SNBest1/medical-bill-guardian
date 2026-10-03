import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
type Rate = { codes: { code: string; type: string }[]; component: string; setting: string; basis: string; amount: number; payer: string | null; plan: string | null; [key: string]: unknown };
/** Public source catalog, deliberately separate from patient-specific financial conclusions. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const code = query.get("code");
  if (!code || !/^[A-Z0-9-]{1,12}$/.test(code)) return NextResponse.json({ error: "A procedure code is required" }, { status: 400 });
  const catalog = JSON.parse(readFileSync("./reference-data/michigan-medicine-selected-rates.json", "utf8"));
  const records = (catalog.records as Rate[]).filter((rate) => rate.codes.some((entry) => entry.code === code) && ["basis", "component", "setting", "payer", "plan"].every((key) => !query.has(key) || rate[key] === query.get(key)));
  return NextResponse.json({ sourceName: catalog.sourceName, sourceUrl: catalog.sourceUrl, sourcePage: catalog.sourcePage, metadata: catalog.metadata, limitations: catalog.limitations, totalMatches: records.length, records: records.slice(0, 50) });
}
