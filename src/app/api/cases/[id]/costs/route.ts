import { existsSync, readFileSync } from "node:fs";
import { scenarioForTransaction } from "@/services/scenarios";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { costView } from "@/services/reconciliation/cost-view";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const c = getStore().get((await context.params).id);
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  let paymentSource = "Bank payment · original source not recorded";
  if (scenarioForTransaction(c.transaction)?.transaction.id === c.transaction.id) paymentSource = "Local demo bank fixture";
  else if (existsSync("data/nessie-seed.json")) {
    try {
      const entries = Object.values(JSON.parse(readFileSync("data/nessie-seed.json", "utf8"))) as { purchaseId?: string }[];
      if (entries.some((entry) => entry.purchaseId === c.transaction.id)) paymentSource = "Capital One Nessie · sandbox bank";
    } catch { /* Preserve the unknown-source label rather than infer provenance. */ }
  }
  return NextResponse.json({ rows: costView(c), paymentSource });
}
