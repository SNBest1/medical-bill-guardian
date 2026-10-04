import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { demoMode } from "@/lib/providers";
import { receiveBankRefund, NessieRefundUncertainError } from "@/services/banking/nessie-refund";
import { mutateCase, CaseBusyError } from "@/services/agent/case-operation";

export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!demoMode()) return NextResponse.json({ error: "Synthetic refund credits require demo mode" }, { status: 403 });
  const id = (await context.params).id;
  if (!getStore().get(id)) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  try { const next = await mutateCase(getStore(), id, (current) => receiveBankRefund(getStore(), current), (error) => error instanceof NessieRefundUncertainError); return NextResponse.json(next); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: error instanceof CaseBusyError || error instanceof NessieRefundUncertainError ? 409 : 400 }); }
}
