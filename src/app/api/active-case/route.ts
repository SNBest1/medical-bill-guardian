import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
export const runtime = "nodejs";
export function GET() { return NextResponse.json(getStore().activeCase()); }
