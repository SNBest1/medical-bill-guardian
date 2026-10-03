import { CaseView } from "@/components/CaseView";
import { demoMode } from "@/lib/providers";

export const dynamic = "force-dynamic";
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  return <CaseView id={(await params).id} demo={demoMode()} />;
}
