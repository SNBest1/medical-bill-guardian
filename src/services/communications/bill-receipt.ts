import type { MedicalBillCase } from "../../types/domain";

/** Receipt and successful parsing are separate facts; never acknowledge a rejected PDF as read. */
export function billReceipt(c: MedicalBillCase | null, caseId: string, attemptId: string) {
  if (!c || c.id !== caseId || c.auditLog[0]?.id !== attemptId) return { status: "unavailable", message: "This call no longer matches the active patient investigation. Do not confirm receipt." };
  if (c.reading?.failed) return { status: "failed", message: "The hospital's text arrived, but the PDF could not be read or matched. Please resend a readable PDF for this fictional patient." };
  if (c.bill && c.reading?.done) return { status: "received", message: "The itemized PDF has arrived and was successfully read for this patient. Confirm receipt and thank the hospital. The patient's review happens separately." };
  if (c.reading?.steps.some((step) => step.kind === "received")) return { status: "processing", message: "The hospital's text arrived. The PDF is still being downloaded and checked. You may confirm the text arrived, but do not say the PDF has been successfully read yet." };
  return { status: "waiting", message: "No bill text has arrived for this investigation yet. Ask them to confirm the destination and check again shortly." };
}
