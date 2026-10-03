import { NextResponse } from "next/server";
import { bankProvider } from "@/lib/providers";
import { discoverHospitalPayments } from "@/services/banking/discovery";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export async function POST() {
  try {
    return NextResponse.json(await discoverHospitalPayments(getStore(), bankProvider()));
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 502 }); }
}
