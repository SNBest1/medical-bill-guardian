import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { advanceBackgroundCase } from "@/services/agent/advance-background";
import { bankProvider, communicationProvider } from "@/lib/providers";
import { discoverHospitalPayments } from "@/services/banking/discovery";
import { processPhotonInbox } from "@/services/communications/photon-inbox";
import { sendPendingProgressUpdates } from "@/services/agent/progress-updates";
import { sendPendingPatientReplies } from "@/services/agent/patient-command";
import { authorizedWorker } from "@/services/agent/worker-auth";

export const runtime = "nodejs";
/** A local worker or scheduler invokes this; discovering a payment does not authorize contact. */
export async function POST(request: Request) {
  if (!authorizedWorker(request)) return new Response(null, { status: 401 });
  if (process.env.DEMO_MODE === "false") return new Response(null, { status: 503 });
  const store = getStore();
  const replies = await sendPendingPatientReplies(store, { replyEnabled: process.env.PHOTON_REPLY_TEXTS === "true", patientPhone: process.env.DEMO_PATIENT_PHONE ?? "" });
  const inbox = processPhotonInbox(store);
  const background = await advanceBackgroundCase(store, communicationProvider());
  const updates = await sendPendingProgressUpdates(store);
  try {
    const discovered = await discoverHospitalPayments(store, bankProvider());
    return NextResponse.json({ detected: discovered.detected, inbox, updates, background, replies });
  } catch { return NextResponse.json({ error: "Bank discovery failed; queued statements were processed", inbox, updates, background, replies }, { status: 502 }); }
}
