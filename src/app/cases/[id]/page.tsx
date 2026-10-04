import { getStore } from "@/lib/db";
import { redirect } from "next/navigation";
import { CaseView } from "@/components/CaseView";
import { demoMode } from "@/lib/providers";

export const dynamic = "force-dynamic";
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const active = getStore().activeCase();
  if (active && active.id !== id) redirect("/");
  return <CaseView id={id} demo={demoMode()} />;
}
