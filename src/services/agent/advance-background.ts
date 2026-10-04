import type { CaseStore } from "../../lib/db";
import type { CommunicationProvider } from "../communications/provider";
import { mutateCase, CaseBusyError } from "./case-operation";
import { notifyCase, settleReviewCall } from "./orchestrator";

/** Reads an already authorized call and prepares its outcome even when the website is closed. Never places a call. */
export async function advanceBackgroundCase(store: CaseStore, provider: CommunicationProvider): Promise<"idle" | "advanced" | "busy" | "failed"> {
  const c = store.activeCase();
  if (!c || (c.status !== "RESOLVED" && !(c.status === "WAITING_FOR_PROVIDER" && c.communications.some((item) => item.type === "BILLING_REVIEW" && item.status === "PENDING" && item.sessionId)))) return "idle";
  try {
    await mutateCase(store, c.id, async (latest) => {
      const settled = await settleReviewCall(latest, provider);
      return settled.status === "RESOLVED" ? notifyCase(settled, provider) : settled;
    });
    return "advanced";
  } catch (error) { return error instanceof CaseBusyError ? "busy" : "failed"; }
}
