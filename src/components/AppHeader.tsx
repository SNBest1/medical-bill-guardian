import { Plus } from "lucide-react";

/** Keeps navigation and demo identity visible across the case workspace. */
export function AppHeader({ caseId, onHome }: { caseId?: string; onHome?: () => void }) {
  return <header className="app-header">
    {onHome ? <button type="button" onClick={onHome} className="app-wordmark"><span><Plus size={16} strokeWidth={3}/></span> Medical Bill Guardian</button> : <span className="app-wordmark"><span><Plus size={16} strokeWidth={3}/></span> Medical Bill Guardian</span>}
    <div className="header-context">{caseId && <span className="case-id">{caseId}</span>}<span className="demo-status"><i/> Synthetic demo</span></div>
  </header>;
}
