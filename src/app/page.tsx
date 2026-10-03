import { Dashboard } from "@/components/Dashboard";
import { demoMode } from "@/lib/providers";

export const dynamic = "force-dynamic";
export default function Home() { return <Dashboard demo={demoMode()} />; }
