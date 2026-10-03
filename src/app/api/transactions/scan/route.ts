import { NextResponse } from "next/server";
import { bankProvider } from "@/lib/providers";
import { isHealthcareTransaction } from "@/services/banking/provider";
import { createCase } from "@/services/agent/orchestrator";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export async function POST() {
  try {
    const transactions = (await bankProvider().getTransactions()).filter(isHealthcareTransaction);
    const cases = transactions.map((transaction) => getStore().create(createCase(transaction)));
    return NextResponse.json({ cases, detected: transactions.length });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 502 }); }
}
