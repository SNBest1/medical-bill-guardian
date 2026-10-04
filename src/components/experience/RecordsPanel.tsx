import { Activity, FileText, FlaskConical, Pill, ScanLine, Stethoscope, TriangleAlert } from "lucide-react";
import type { MedicalBillCase, MedicalRecord, RecordSource } from "../../types/domain";
import { categoryLabel, clock } from "../../services/medical/record-source";

type Group = { id: string; label: string; match: (record: MedicalRecord) => boolean; Icon: typeof Activity };
/** Records read from FinchNode carry their category, so they are listed exactly as FinchNode named them. */
const finchGroups: Group[] = [
  { id: "encounters", label: "Encounters", Icon: Stethoscope },
  { id: "diagnosticReports", label: "Diagnostic reports", Icon: FileText },
  { id: "labs", label: "Lab results", Icon: FlaskConical },
  { id: "medicationAdministrations", label: "Medications administered", Icon: Pill },
  { id: "medications", label: "Medications on record", Icon: Pill },
  { id: "vitals", label: "Vital signs", Icon: Activity },
  { id: "documents", label: "Documents", Icon: FileText },
  { id: "procedures", label: "Procedures", Icon: ScanLine }
].map((group) => ({ ...group, match: (record: MedicalRecord) => record.category === group.id }));
/** Hand-written rehearsal records have no FinchNode category, so they keep the type grouping. */
const typeGroups: Group[] = [
  { id: "imaging", label: "Imaging and procedures", types: ["imaging", "procedure"], Icon: ScanLine },
  { id: "medication", label: "Medication", types: ["medication"], Icon: Pill },
  { id: "encounter", label: "Encounters", types: ["encounter"], Icon: Stethoscope },
  { id: "other", label: "Labs and documents", types: ["lab", "document"], Icon: FileText }
].map(({ types, ...group }) => ({ ...group, match: (record: MedicalRecord) => !record.category && types.includes(record.type) }));

/** What was pulled and from where: the honest live/fallback label, subject, organization, time, and a count per category. */
export function RecordSourceSummary({ source, total }: { source: RecordSource; total: number }) {
  const counts = Object.entries(source.counts ?? {}).filter(([, count]) => count > 0);
  return <div className="gx-source" data-live={source.live ? "true" : "false"}>
    <p className="gx-source-label">{source.fallbackReason ? <TriangleAlert size={13}/> : null}{source.label}</p>
    {(source.subject || source.organization || source.retrievedAt) && <p className="gx-source-meta">{[source.subject && `Subject ${source.subject}`, source.organization, source.retrievedAt && `${source.live ? "Retrieved" : "Saved copy read"} ${clock(source.retrievedAt)}`, source.consentedAt && `Consent recorded ${source.consentedAt}`].filter(Boolean).join(" · ")}</p>}
    {counts.length > 0 && <ul className="gx-source-counts" aria-label={`${total} records kept for this visit`}>{counts.map(([category, count]) => <li key={category}><b>{count}</b> {categoryLabel(category, count)}</li>)}</ul>}
    {source.sandboxNote && <p className="gx-source-meta">Consented sandbox patient not used: {source.sandboxNote}.</p>}{source.fallbackReason && <p className="gx-source-meta">Live pull failed ({source.fallbackReason}); these records are the saved copy of the same synthetic patient.</p>}
  </div>;
}

/** Lists the clinical records the agent retrieved, grouped by category, with the honest source label. */
export function RecordsPanel({ caseData }: { caseData: MedicalBillCase }) {
  if (!caseData.medicalRecords.length) return null;
  const source = caseData.recordSource;
  return <section className="gx-records" aria-label="Retrieved medical records">
    <div className="gx-records-head"><span className="gx-kicker">RECORDS RETRIEVED</span>{source?.subject ? <RecordSourceSummary source={source} total={caseData.medicalRecords.length} /> : <p>{source?.label ?? "Patient-authorized synthetic records"}</p>}</div>
    <div className="gx-records-grid">
      {[...finchGroups, ...typeGroups].map(({ id, label, match, Icon }) => {
        const items = caseData.medicalRecords.filter(match);
        if (!items.length) return null;
        return <div key={id} className="gx-records-group"><h3><Icon size={14}/>{label}<b>{items.length}</b></h3><ul>{items.map((record) => <li key={record.id}><span>{record.description}</span><small>{record.date}</small></li>)}</ul></div>;
      })}
    </div>
  </section>;
}
