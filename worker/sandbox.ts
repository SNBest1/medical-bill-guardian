import { getSandboxEvidence } from "../src/integrations/sandbox-evidence";
import { callReducer } from "./db";
import type { Env } from "./types";

/** Verifies the caller's SpacetimeDB identity before importing sandbox evidence for that owner. */
export async function handleSandboxDiscover(request: Request, env: Env): Promise<Response> {
  if (!env.SPACETIME_HTTP_URL || !env.SPACETIME_DB_NAME || !env.SPACETIME_OWNER_TOKEN) return Response.json({ error: "SpacetimeDB connector is not configured" }, { status: 503 });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const body = await request.json().catch(() => null) as { ownerIdentity?: unknown } | null;
  const ownerIdentity = body?.ownerIdentity;
  if (!token || typeof ownerIdentity !== "string" || !/^[0-9a-f]{64}$/i.test(ownerIdentity)) return Response.json({ error: "Valid case owner credentials are required" }, { status: 401 });

  const host = env.SPACETIME_HTTP_URL.replace(/\/$/, "");
  const verification = await fetch(`${host}/v1/identity/${ownerIdentity}/verify`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!verification) return Response.json({ error: "Identity verification is unavailable" }, { status: 503 });
  if (verification.status !== 204) return Response.json({ error: "Identity verification failed" }, { status: 401 });

  const evidence = await getSandboxEvidence(env);
  try {
    if (evidence.transactionSource === "MOCK") {
      const response = await fetch(`${host}/v1/database/${encodeURIComponent(env.SPACETIME_DB_NAME)}/call/scan_demo_payment`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "[]"
      });
      if (!response.ok) throw new Error(`Demo scan failed (${response.status})`);
    } else {
      await callReducer(env, "ingest_external_case", [
        ownerIdentity, evidence.transaction.id, evidence.transaction.merchant, Math.round(evidence.transaction.amount * 100), evidence.transaction.date,
        evidence.transactionSource, evidence.recordsSource,
        evidence.records.map((record) => ({ kind: record.type, description: record.description, date: record.date, provider: record.provider }))
      ]);
    }
  } catch {
    return Response.json({ error: "Could not save the discovered case" }, { status: 502 });
  }
  return Response.json({ transactionSource: evidence.transactionSource, recordsSource: evidence.recordsSource, fallbackReason: evidence.fallbackReason ?? null });
}
