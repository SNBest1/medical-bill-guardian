import { NextResponse } from "next/server";
import { bankProvider } from "@/lib/providers";
import { isHealthcareTransaction } from "@/services/banking/provider";

export const runtime = "nodejs";
export async function GET() {
  try {
    const transactions = await bankProvider().getTransactions();
    return NextResponse.json(transactions.map((transaction) => ({ ...transaction, healthcare: isHealthcareTransaction(transaction) })));
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 502 }); }
}
