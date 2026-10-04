import type { CaseStatus } from "@/types/domain";
import { Check } from "lucide-react";
import { getDemoStage, type DemoStage } from "./case-presentation";

const stages: { id: DemoStage; number: string; label: string; detail: string }[] = [
  { id: "detect", number: "01", label: "Detect", detail: "Payment opens a case" },
  { id: "retrieve", number: "02", label: "Retrieve", detail: "Bill and records arrive" },
  { id: "reconcile", number: "03", label: "Reconcile", detail: "Every line gets checked" },
  { id: "decide", number: "04", label: "Decide", detail: "You approve outreach" },
];

export function WorkflowRibbon({ status }: { status: CaseStatus }) {
  const current = getDemoStage(status);
  const currentIndex = current === "complete" ? stages.length : stages.findIndex((stage) => stage.id === current);
  return <section className="workflow-ribbon" aria-label="Investigation progress">
    {stages.map((stage, index) => <div className={`workflow-stage ${index < currentIndex ? "done" : index === currentIndex ? "current" : ""}`} key={stage.id}>
      <span className="stage-number">{index < currentIndex ? <Check size={13} strokeWidth={3}/> : stage.number}</span>
      <span><strong>{stage.label}</strong><small>{stage.detail}</small></span>
    </div>)}
  </section>;
}
