import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";

const SCOPES = new Set(["INVESTIGATE"]);
const MAX_TTL_MINUTES = 24 * 60;

/** Grants a scoped, time-boxed authorization the patient gives ahead of an unattended run
 * (e.g. a worker investigating a discovered payment with nobody present to click "authorize").
 * Explicit confirmation is required; this is never inferred from a payment or discovery event. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  if (!getStore().get(id)) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { scope?: string; confirm?: boolean; ttlMinutes?: number };
  if (body.confirm !== true) return NextResponse.json({ error: "Explicit patient confirmation is required" }, { status: 403 });
  if (!body.scope || !SCOPES.has(body.scope)) return NextResponse.json({ error: `Scope must be one of: ${[...SCOPES].join(", ")}` }, { status: 400 });
  const ttlMinutes = Math.min(Math.max(body.ttlMinutes ?? 60, 1), MAX_TTL_MINUTES);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  getStore().grantAuthorization(id, body.scope, expiresAt);
  return NextResponse.json({ caseId: id, scope: body.scope, expiresAt });
}

/** Revokes a standing authorization before it is used or expires. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  if (!getStore().get(id)) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  getStore().revokeAuthorization(id);
  return NextResponse.json({ caseId: id, revoked: true });
}

/** Reports whether a live authorization exists, without implying it has been acted on. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  if (!getStore().get(id)) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  return NextResponse.json({ caseId: id, authorization: getStore().getAuthorization(id) });
}
