import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { bankProvider } from "@/lib/providers";
import { discoverHospitalPayments } from "@/services/banking/discovery";
import { processPhotonInbox } from "@/services/communications/photon-inbox";
import { authorizedWorker } from "@/services/agent/worker-auth";

export const runtime = "nodejs";
/** A local worker or scheduler invokes this; discovering a payment does not authorize contact. */
export async function POST(request: Request) {
  if (!authorizedWorker(request)) return new Response(null, { status: 401 });
  if (process.env.DEMO_MODE === "false") return new Response(null, { status: 503 });
  const store = getStore();
  const inbox = processPhotonInbox(store);
  try {
    const discovered = await discoverHospitalPayments(store, bankProvider());
    return NextResponse.json({ detected: discovered.detected, inbox });
  } catch { return NextResponse.json({ error: "Bank discovery failed; queued statements were processed", inbox }, { status: 502 }); }
}
