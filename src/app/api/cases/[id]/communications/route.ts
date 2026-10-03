import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const found = getStore().get((await context.params).id);
  return found ? NextResponse.json(found.communications) : NextResponse.json({ error: "Case not found" }, { status: 404 });
}
