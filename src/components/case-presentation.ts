import type { CaseStatus, Finding, MedicalBillCase } from "../types/domain";

export type DemoStage = "detect" | "retrieve" | "reconcile" | "decide" | "complete";
export type CaseNumbers = { original: number; corrected: number | null; adjustment: number };

export function formatActionError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const error = "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
  const upstreamStatus = "upstreamStatus" in payload && typeof payload.upstreamStatus === "number" ? payload.upstreamStatus : null;
  const responseBody = "responseBody" in payload && typeof payload.responseBody === "string" ? payload.responseBody : null;

  if (upstreamStatus !== null && responseBody !== null) {
    return `${error} (HTTP ${upstreamStatus}): ${responseBody}`;
  }

  return error;
}

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

export function getItemizedBillRequestCopy(status: CaseStatus): { heading: string; detail: string } | null {
  if (status === "REQUESTING_BILL") {
    return {
      heading: "Call hospital billing for the itemized statement?",
      detail: "Your authorization lets the AI agent call the configured consenting demo recipient. No real patient information should be shared.",
    };
  }

  if (status === "WAITING_FOR_BILL") {
    return {
      heading: "Call queued. Preparing the demo statement.",
      detail: "The statement used next is a synthetic fixture prepared by the demo—not a document collected by the call.",
    };
  }

  return null;
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
