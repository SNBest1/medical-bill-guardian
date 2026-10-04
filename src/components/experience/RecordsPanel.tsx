import { Activity, Pill, Stethoscope, FileText, ScanLine } from "lucide-react";
import type { MedicalBillCase, MedicalRecord } from "@/types/domain";

const groups: Array<{ id: string; label: string; types: MedicalRecord["type"][]; Icon: typeof Activity }> = [
  { id: "imaging", label: "Imaging and procedures", types: ["imaging", "procedure"], Icon: ScanLine },
  { id: "medication", label: "Medication", types: ["medication"], Icon: Pill },
  { id: "encounter", label: "Encounters", types: ["encounter"], Icon: Stethoscope },
  { id: "other", label: "Labs and documents", types: ["lab", "document"], Icon: FileText }
];

/** Lists the clinical records the agent retrieved, grouped by category, with the honest source label. */
export function RecordsPanel({ caseData }: { caseData: MedicalBillCase }) {
  if (!caseData.medicalRecords.length) return null;
  return <section className="gx-records" aria-label="Retrieved medical records">
    <div className="gx-records-head"><span className="gx-kicker">RECORDS RETRIEVED</span><p>{caseData.recordSource?.label ?? "Patient-authorized synthetic records"}</p></div>
    <div className="gx-records-grid">
      {groups.map(({ id, label, types, Icon }) => {
        const items = caseData.medicalRecords.filter((record) => types.includes(record.type));
        if (!items.length) return null;
        return <div key={id} className="gx-records-group"><h3><Icon size={14}/>{label}<b>{items.length}</b></h3><ul>{items.map((record) => <li key={record.id}><span>{record.description}</span><small>{record.date}</small></li>)}</ul></div>;
      })}
    </div>
  </section>;
}
