import type { Finding, MedicalBillCase } from "@/types/domain";

export type ExperienceBeat = "bill" | "collecting" | "reading" | "evidence" | "conversation" | "outcome";

export interface CaseViewModel {
  beat: ExperienceBeat;
  originalAmount: number;
  correctedAmount?: number;
  adjustment?: number;
  refundStatus?: "REFUND_PENDING" | "REFUND_RECEIVED";
  questionFinding?: Finding;
  supportedCount: number;
  canCollect: boolean;
  canReview: boolean;
  isWaiting: boolean;
  /** A hospital-texted PDF is being read right now. */
  isReading: boolean;
  isComplete: boolean;
}

export function caseViewModel(caseData: MedicalBillCase): CaseViewModel {
  const questionFinding = caseData.findings.find((finding) => finding.action === "REQUEST_REVIEW");
  const isComplete = Boolean(caseData.resolution);
  const isReading = caseData.status === "WAITING_FOR_BILL" && Boolean(caseData.reading && !caseData.reading.done);
  const beat: ExperienceBeat = isComplete
    ? "outcome"
    : isReading
      ? "reading"
      : caseData.status === "REVIEW_REQUIRED"
        ? "evidence"
        : caseData.status === "DETECTED"
          ? "bill"
          : "collecting";
  return {
    beat,
    originalAmount: caseData.transaction.amount,
    correctedAmount: caseData.resolution?.correctedTotal,
    adjustment: caseData.resolution?.adjustment,
    refundStatus: caseData.recovery?.status,
    questionFinding,
    supportedCount: caseData.findings.filter((finding) => finding.clinicalStatus === "SUPPORTED").length,
    canCollect: caseData.status === "DETECTED",
    canReview: caseData.status === "REVIEW_REQUIRED",
    isWaiting: caseData.status === "WAITING_FOR_BILL",
    isReading,
    isComplete,
  };
}
