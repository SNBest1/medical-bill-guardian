import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { parsePhotonStatement, verifyPhotonSignature } from "@/services/communications/photon-inbox";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 131072;

/** Stops reading as soon as the body exceeds the cap, instead of buffering an unbounded stream first. */
async function readBoundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("Body too large");
    return buffer;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock?.(); }
  return Buffer.concat(chunks);
}

export async function POST(request: Request) {
  const secret = process.env.SPECTRUM_WEBHOOK_SECRET;
  if (process.env.DEMO_MODE === "false" || !secret) return NextResponse.json({ error: "Synthetic webhook is not configured" }, { status: 503 });
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let raw: Buffer;
  try { raw = await readBoundedBody(request, MAX_BODY_BYTES); }
  catch { return new Response(null, { status: 413 }); }
  if (!verifyPhotonSignature(raw, request.headers, secret)) return new Response(null, { status: 401 });
  try {
    const entry = parsePhotonStatement(JSON.parse(raw.toString("utf8")), process.env.DEMO_HOSPITAL_PHONE ?? "");
    if (!entry) return NextResponse.json({ accepted: false, ignored: true });
    const inserted = getStore().enqueueStatement(entry);
    return NextResponse.json({ accepted: true, duplicate: !inserted }, { status: 202 });
  } catch { return NextResponse.json({ error: "Invalid signed statement delivery" }, { status: 400 }); }
}
