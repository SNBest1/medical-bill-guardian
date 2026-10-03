import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { createCase } from "@/services/agent/orchestrator";
import type { Transaction } from "@/types/domain";
import { isHealthcareTransaction } from "@/services/banking/provider";
import { demoMode } from "@/lib/providers";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json(getStore().list()); }
export async function POST(request: NextRequest) {
  const transaction = await request.json() as Transaction;
  if (!transaction?.id || !transaction.merchant || !Number.isFinite(transaction.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date ?? "")) return NextResponse.json({ error: "A valid transaction is required" }, { status: 400 });
  if (!isHealthcareTransaction(transaction)) return NextResponse.json({ error: "Only healthcare transactions can open a medical bill case" }, { status: 400 });
  if (demoMode() && transaction.id !== "nessie-demo-4820") return NextResponse.json({ error: "Demo mode supports only the seeded University Hospital payment" }, { status: 400 });
  return NextResponse.json(getStore().create(createCase(transaction)), { status: 201 });
}
