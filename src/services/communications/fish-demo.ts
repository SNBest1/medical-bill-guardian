import { createHash } from "node:crypto";
import type { Communication, Finding } from "../../types/domain";
import { MockCommunicationProvider } from "./mock";
import type { CommunicationProvider, ItemizedBillRequestContext } from "./provider";
import { buildDynamicVariables, FishConfigError, fishProblems, maskPhone, type FishDemoConfig } from "./fish-call";

export { FishConfigError, type FishDemoConfig } from "./fish-call";

const FISH_CALL_URL = "https://api.fish.audio/v1/agent/phone-calls";

/**
 * Stable per demo run and destination: a network retry or double click maps to the same Fish
 * operation, while a demo reset (new attemptId) or a new destination is a distinct call.
 * Contains no phone digits.
 */
export function fishCallIdempotencyKey(caseId: string, attemptId: string, toNumber: string) {
  const fingerprint = createHash("sha256").update(`${attemptId}\0${toNumber.trim()}`).digest("hex").slice(0, 16);
  return `medical-bill-guardian:${caseId}:request-itemized-bill:${fingerprint}`;
}

/** Fish rejected the call or answered unusably. `responseBody` is redacted; never show it to a user. */
export class FishCallError extends Error {
  constructor(public readonly status: number, public readonly responseBody: string) {
    super(`Fish Audio call failed with HTTP ${status}`);
    this.name = "FishCallError";
  }
}

/** A safe, user-facing explanation of a Fish failure. Never includes the upstream body. */
export function fishErrorMessage(status: number): string {
  switch (status) {
    case 401: return "Fish Audio rejected the API key. Check FISH_API_KEY on the server.";
    case 402: return "The Fish Audio account has insufficient balance for a call.";
    case 403: return "Outbound calling is not enabled for this Fish Audio account or agent.";
    case 404: return "Fish Audio could not find the configured agent or phone number.";
    case 409: return "The Fish agent is not published yet, or this call request conflicts with an earlier one.";
    case 422: return "Fish Audio refused this call (invalid or blocked destination, or invalid call variables).";
    case 429: return "Fish Audio is rate limiting calls. Wait a moment and try again.";
    default: return status >= 500 ? "Fish Audio's telephony service is unavailable. Try again shortly; the retry will not place a duplicate call." : "Fish Audio could not queue the call.";
  }
}

const redact = (value: string, config: FishDemoConfig) => {
  let safe = value;
  for (const secret of [config.apiKey, config.toNumber, config.hospitalPhone, config.guardianLine]) {
    if (secret) safe = safe.replaceAll(secret, "[REDACTED]");
  }
  return safe;
};

const readSafeBody = async (response: Response, config: FishDemoConfig) => {
  const raw = await response.text();
  if (!raw) return "<empty response>";
  try {
    return redact(JSON.stringify(JSON.parse(raw)), config);
  } catch {
    return redact(raw, config);
  }
};

export class FishDemoCommunicationProvider implements CommunicationProvider {
  /** A real phone call rings a real phone, so the case pauses for explicit user authorization first. */
  readonly requiresCallAuthorization = true;

  constructor(
    private readonly config: FishDemoConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly fallback = new MockCommunicationProvider(Number.POSITIVE_INFINITY),
  ) {}

  /** Places one outbound call. Call only after the user's explicit authorization. */
  async requestItemizedBill({ caseId, attemptId, providerName, scenarioId }: ItemizedBillRequestContext): Promise<Communication> {
    const problems = fishProblems(this.config);
    if (problems.length) throw new FishConfigError(problems);
    const dynamicVariables = buildDynamicVariables(providerName, this.config, scenarioId);

    let response: Response;
    try {
      response = await this.fetcher(FISH_CALL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": fishCallIdempotencyKey(caseId, attemptId, this.config.toNumber),
        },
        body: JSON.stringify({
          agent_id: this.config.agentId,
          phone_number_id: this.config.phoneNumberId,
          to_number: this.config.toNumber,
          dynamic_variables: dynamicVariables,
        }),
      });
    } catch (cause) {
      const detail = cause instanceof Error ? redact(cause.message, this.config) : "Unknown network error";
      throw new Error(`Fish Audio could not be reached, so no call was confirmed. Retrying is safe and will not place a duplicate call. (${detail})`);
    }

    const responseBody = await readSafeBody(response, this.config);
    if (response.status !== 201) throw new FishCallError(response.status, responseBody);

    let sessionId: string | undefined;
    try {
      const parsed = JSON.parse(responseBody) as { session_id?: unknown };
      if (typeof parsed.session_id === "string" && parsed.session_id.trim()) sessionId = parsed.session_id;
    } catch {
      // The redacted body is carried by the typed error below.
    }
    if (!sessionId) throw new FishCallError(201, responseBody);

    return {
      id: crypto.randomUUID(),
      type: "ITEMIZED_BILL_REQUEST",
      timestamp: new Date().toISOString(),
      status: "PENDING",
      transcript: `AI demo call to ${providerName} billing at the configured demo recipient (${maskPhone(this.config.toNumber)}), asking for an itemized bill and for it to be texted as a PDF link to the Guardian line (${maskPhone(this.config.guardianLine)}). Fictional demonstration data only.`,
      result: `Fish call queued · session ${sessionId}`,
    };
  }

  /** A queued call is not a statement: the bill arrives only when the hospital texts it (or the configured demo fallback delivers it). */
  getItemizedBill(providerName: string, request: Communication, scenarioId?: string) {
    return this.fallback.getItemizedBill(providerName, request, scenarioId);
  }

  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[], insurance?: Parameters<CommunicationProvider["requestBillingReview"]>[3]) {
    return this.fallback.requestBillingReview(providerName, invoiceId, findings, insurance);
  }

  notifyUser(summary: string) {
    return this.fallback.notifyUser(summary);
  }
}
