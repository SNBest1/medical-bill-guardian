import { timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/db";
import { billReceipt } from "@/services/communications/bill-receipt";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const token = process.env.FISH_RECEIPT_TOKEN;
  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  if (process.env.DEMO_MODE === "false" || !token || token.length < 32 || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null) as { case_id?: unknown; attempt_id?: unknown } | null;
  if (typeof body?.case_id !== "string" || typeof body?.attempt_id !== "string") return new Response(null, { status: 400 });
  return Response.json(billReceipt(getStore().activeCase(), body.case_id, body.attempt_id), { headers: { "Cache-Control": "no-store" } });
}
