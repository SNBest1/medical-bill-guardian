import type { MedicalBillCase } from "../../types/domain";
import { getScenario, scenarioForTransaction } from "../scenarios";

/** Receipt and successful parsing are separate facts; never acknowledge a rejected PDF as read. */
export function billReceipt(c: MedicalBillCase | null, caseId: string, attemptId: string) {
  if (!c || c.id !== caseId || c.auditLog[0]?.id !== attemptId) return { status: "unavailable", message: "This call no longer matches the active patient investigation. Do not confirm receipt." };
  if (c.reading?.failed) {
    const error = c.reading.steps.findLast((step) => step.kind === "error");
    const reason = error ? `${error.text}${error.detail ? `: ${error.detail}` : ""}` : "The PDF could not be read or matched.";
    const scenario = c.scenarioId ? getScenario(c.scenarioId) : scenarioForTransaction(c.transaction);
    const expectedPatient = scenario ? `${scenario.patient.firstName} ${scenario.patient.lastName}` : undefined;
    const extractedPatient = c.reading.steps.findLast((step) => step.kind === "patient")?.text.replace(/^Patient:\s*/i, "");
    const mismatch = expectedPatient && extractedPatient && extractedPatient.trim().toLowerCase() !== expectedPatient.toLowerCase();
    return {
      status: "failed", reason, expected_patient: expectedPatient,
      message: mismatch
        ? `The text arrived and the PDF was successfully read, but it names ${extractedPatient}. This investigation is for ${expectedPatient}, so the bill was not applied. Explain that patient mismatch and ask the hospital to send ${expectedPatient}'s itemized bill. Do not say the PDF was unreadable.`
        : `The hospital's text arrived, but the bill was not applied. Explain this specific failure: ${reason} Ask the hospital to correct it and resend the itemized bill${expectedPatient ? ` for ${expectedPatient}` : ""}.`,
    };
  }
  if (c.bill && c.reading?.done) return { status: "received", message: "The itemized PDF has arrived and was successfully read for this patient. Confirm receipt and thank the hospital. The patient's review happens separately." };
  if (c.reading?.steps.some((step) => step.kind === "received")) return { status: "processing", message: "The hospital's text arrived. The PDF is still being downloaded and checked. You may confirm the text arrived, but do not say the PDF has been successfully read yet." };
  return { status: "waiting", message: "No bill text has arrived for this investigation yet. Ask them to confirm the destination and check again shortly." };
}
