import type { CaseStatus, Finding, MedicalBillCase } from "../types/domain";

export type DemoStage = "detect" | "retrieve" | "reconcile" | "decide" | "complete";
export type CaseNumbers = { original: number; corrected: number | null; adjustment: number };

export function getDemoStage(status: CaseStatus): DemoStage {
  if (status === "DETECTED") return "detect";
  if (["FETCHING_RECORDS", "REQUESTING_BILL", "WAITING_FOR_BILL"].includes(status)) return "retrieve";
  if (status === "ANALYZING") return "reconcile";
  if (["REVIEW_REQUIRED", "CONTACTING_PROVIDER", "WAITING_FOR_PROVIDER"].includes(status)) return "decide";
  return "complete";
}

export function getStatusCopy(status: CaseStatus) {
  const copy: Record<CaseStatus, string> = {
    DETECTED: "Payment ready to trace",
    FETCHING_RECORDS: "Retrieving medical records",
    REQUESTING_BILL: "Requesting the itemized statement",
    WAITING_FOR_BILL: "Waiting for the itemized statement",
    ANALYZING: "Matching charges to records",
    REVIEW_REQUIRED: "Your decision is needed",
    CONTACTING_PROVIDER: "Contacting provider billing",
    WAITING_FOR_PROVIDER: "Waiting for provider billing",
    RESOLVED: "Provider response received",
    USER_NOTIFIED: "Investigation complete",
    FAILED: "Investigation needs attention",
  };
  return copy[status];
}

export function getCaseNumbers(caseData: MedicalBillCase): CaseNumbers {
  return {
    original: caseData.transaction.amount,
    corrected: caseData.resolution?.correctedTotal ?? null,
    adjustment: caseData.resolution?.adjustment ?? 0,
  };
}

export function getFindingTone(finding?: Finding) {
  if (!finding) return "neutral" as const;
  if (finding.action === "REQUEST_REVIEW") return "attention" as const;
  if (finding.clinicalStatus === "SUPPORTED") return "supported" as const;
  return "neutral" as const;
}
