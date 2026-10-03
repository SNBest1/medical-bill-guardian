import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { demoMode } from "@/lib/providers";
import { assessPatientBalance, validateInsurance } from "@/services/reconciliation/insurance";
import { comparePrices, loadPriceReferences } from "@/services/reconciliation/pricing";
import { reconcile } from "@/services/reconciliation/reconcile";
import { mutateCase, CaseBusyError } from "@/services/agent/case-operation";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!demoMode()) return NextResponse.json({ error: "Insurance intake requires the synthetic demo" }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 65536) return NextResponse.json({ error: "Insurance context too large" }, { status: 413 });
  const id = (await context.params).id;
  const existing = getStore().get(id);
  if (!existing) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!existing.bill) return NextResponse.json({ error: "An itemized bill is required" }, { status: 400 });
  try {
    const next = await mutateCase(getStore(), id, (current) => {
      if (!current.bill) throw new Error("An itemized bill is required");
      if (current.resolution) throw new Error("Restart the synthetic case before changing insurance after a billing outcome");
      const insurance = validateInsurance(JSON.parse(raw));
      const updated = structuredClone(current);
      updated.insurance = insurance;
      updated.financialReview = assessPatientBalance(current.bill, current.transaction.amount, insurance);
      updated.findings = comparePrices(current.bill, reconcile(current.bill, current.medicalRecords), loadPriceReferences(), insurance);
      updated.updatedAt = new Date().toISOString();
      updated.auditLog.push({ id: crypto.randomUUID(), timestamp: updated.updatedAt, action: "REVIEW_PATIENT_BALANCE", tool: "assessPatientBalance", inputSummary: "Synthetic insurance/EOB input", outputSummary: updated.financialReview.status, status: "SUCCESS" });
      return updated;
    });
    return NextResponse.json(next);
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: error instanceof CaseBusyError ? 409 : 400 }); }
}
