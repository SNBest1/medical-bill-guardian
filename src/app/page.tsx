import { Dashboard } from "@/components/Dashboard";
import { CaseView } from "@/components/CaseView";
import { getStore } from "@/lib/db";
import { demoMode } from "@/lib/providers";
export const dynamic = "force-dynamic";
export default function Home() {
  const active = getStore().activeCase();
  return active ? <CaseView id={active.id} demo={demoMode()} /> : <Dashboard demo={demoMode()} />;
}
