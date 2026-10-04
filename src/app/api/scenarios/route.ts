import { NextResponse } from "next/server";
import { scenarios } from "@/services/scenarios";

export const runtime = "nodejs";
/** The accidents a judge can pick. Records, bill, and hospital reply stay server-side. */
export function GET() {
  return NextResponse.json(scenarios.map(({ id, label, accident, patient, hospital, transaction }) => ({ id, label, accident, patient: `${patient.firstName} ${patient.lastName}`, hospital: hospital.name, amount: transaction.amount, date: transaction.date })));
}
