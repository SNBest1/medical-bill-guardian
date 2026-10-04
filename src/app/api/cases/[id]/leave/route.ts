import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  const store = getStore();
  if (!store.get(id)) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  store.leaveCase(id);
  return NextResponse.json({ left: true });
}
