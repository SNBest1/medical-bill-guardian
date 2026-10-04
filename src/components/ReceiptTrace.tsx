import { Check, CircleHelp, CircleMinus } from "lucide-react";
import type { MedicalBillCase } from "@/types/domain";
import { getCaseNumbers, getFindingTone } from "./case-presentation";

const money = (value: number) => `$${value.toLocaleString()}`;

export function ReceiptTrace({ caseData, selectedId, onSelect, compact = false }: { caseData: MedicalBillCase; selectedId?: string | null; onSelect?: (id: string) => void; compact?: boolean }) {
  const { original, corrected, adjustment } = getCaseNumbers(caseData);
  return <div className={`receipt-trace ${compact ? "compact" : ""}`}>
    <div className="receipt-provider">{caseData.provider.name}</div>
    <div className="receipt-meta">{caseData.bill ? `ITEMIZED STATEMENT · ${caseData.bill.invoiceId}` : "PAYMENT SIGNAL · STATEMENT PENDING"}<br/>{caseData.transaction.date}</div>
    <div className="receipt-amount">{money(corrected ?? original)}</div>
    <div className="receipt-caption">{corrected ? "CORRECTED TOTAL" : "ORIGINAL PAYMENT"}</div>
    {caseData.bill ? <div className="receipt-lines">{caseData.bill.items.map((item) => {
      const finding = caseData.findings.find((entry) => entry.billItemId === item.id);
      const tone = getFindingTone(finding);
      const resolved = tone === "attention" && Boolean(caseData.resolution);
      const content = <><span className="line-state">{tone === "supported" || resolved ? <Check size={12} strokeWidth={3}/> : tone === "attention" ? <CircleHelp size={13}/> : <CircleMinus size={12}/>}</span><span className="line-copy"><strong>{item.description}</strong><small>{resolved ? "Removed after provider review" : tone === "supported" ? "Supported by record" : tone === "attention" ? "Verify this line" : "Analysis pending"}</small></span><b>{money(item.amount)}</b></>;
      const className = `receipt-line ${resolved ? "resolved" : tone} ${selectedId === item.id ? "selected" : ""}`;
      return onSelect ? <button type="button" key={item.id} className={className} onClick={() => onSelect(item.id)} aria-pressed={selectedId === item.id}>{content}</button> : <div key={item.id} className={className}>{content}</div>;
    })}</div> : <div className="receipt-pending"><span/><span/><span/><p>The itemized statement will appear here when the investigation begins.</p></div>}
    <div className="receipt-total"><span>{corrected ? "NEW TOTAL" : "TOTAL"}</span><strong>{money(corrected ?? original)}</strong></div>
    {adjustment > 0 && <div className="receipt-adjustment">Provider confirmed {money(adjustment)} removed</div>}
  </div>;
}
