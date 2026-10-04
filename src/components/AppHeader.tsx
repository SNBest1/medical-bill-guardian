import Link from "next/link";
import { Plus } from "lucide-react";

export function AppHeader({ caseId }: { caseId?: string }) {
  return <header className="app-header">
    <Link href="/" className="app-wordmark"><span><Plus size={16} strokeWidth={3}/></span> Medical Bill Guardian</Link>
    <div className="header-context">{caseId && <span className="case-id">{caseId}</span>}<span className="demo-status"><i/> Synthetic demo</span></div>
  </header>;
}
