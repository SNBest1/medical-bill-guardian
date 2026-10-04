import { NextResponse } from "next/server";
import { getStore } from "../../../../../lib/db";
import { communicationProvider } from "../../../../../lib/providers";
import { requestItemizedBill, scenarioIdOf } from "../../../../../services/agent/orchestrator";
import { mutateCase, CaseBusyError } from "../../../../../services/agent/case-operation";
import { callBrief, buildDynamicVariables, fishConfigFromEnv, fishProblems, maskPhone } from "../../../../../services/communications/fish-call";
import { FishCallError, FishConfigError, fishErrorMessage } from "../../../../../services/communications/fish-demo";

export const runtime = "nodejs";

/**
 * What the authorization panel shows before the user decides. Built on the server from the case
 * and configuration; the browser only ever receives masked numbers, never a key or a full number.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = getStore().get((await context.params).id);
  if (!current) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const config = fishConfigFromEnv();
  if (!config) return NextResponse.json({ fish: false });
  const problems = fishProblems(config);
  let brief: string[] = [];
  try { brief = callBrief(buildDynamicVariables(current.provider.name, config, scenarioIdOf(current))); } catch { problems.push("this case has no demo scenario to brief the call"); }
  return NextResponse.json({ fish: true, ready: problems.length === 0, problems, brief, destination: maskPhone(config.toNumber), guardianLine: maskPhone(config.guardianLine) });
}

/** Places the real outbound call, once, only on explicit authorization from the case page. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  const store = getStore();
  if (!store.get(id)) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  let authorized = false;
  try {
    authorized = (await request.json() as { authorized?: unknown }).authorized === true;
  } catch {
    return NextResponse.json({ error: "A valid JSON body with explicit authorization is required" }, { status: 400 });
  }
  if (!authorized) return NextResponse.json({ error: "Authorize the hospital call before it is placed" }, { status: 400 });

  try {
    // mutateCase holds the persisted per-case guard, so concurrent clicks cannot both reach Fish.
    const next = await mutateCase(store, id, (latest) => requestItemizedBill(latest, communicationProvider(), true));
    return NextResponse.json(next);
  } catch (error) {
    if (error instanceof CaseBusyError) return NextResponse.json({ error: "A call request is already in progress for this case" }, { status: 409 });
    if (error instanceof FishCallError) return NextResponse.json({ error: fishErrorMessage(error.status), upstreamStatus: error.status }, { status: 502 });
    if (error instanceof FishConfigError) return NextResponse.json({ error: `The call cannot be placed yet: ${error.problems.join("; ")}.` }, { status: 503 });
    const message = error instanceof Error ? error.message : "The call request failed";
    // Orchestrator guards (wrong state, repeat request) carry fixed, safe text; anything unexpected is reduced to a generic message.
    const known = /not ready|already exists|authorization/i.test(message);
    return NextResponse.json({ error: known ? message : "The call request failed. No call was confirmed; you can try again." }, { status: known ? 409 : 502 });
  }
}
