import { getStore } from "@/lib/db";
import { progressTextKey } from "@/services/agent/progress-updates";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const store = getStore();
  const c = store.activeCase();
  if (!c || c.id !== (await context.params).id) return new Response(null, { status: 404 });
  const key = progressTextKey(c);
  const enabled = process.env.PHOTON_UPDATE_TEXTS === "true" && process.env.PHOTON_DEMO_TEXTS === "true";
  return Response.json({ enabled, status: key ? store.textStatus(key)?.status ?? "PENDING" : null }, { headers: { "Cache-Control": "no-store" } });
}
