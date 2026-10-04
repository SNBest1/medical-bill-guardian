import { createHash } from "node:crypto";
import type { Communication, Finding } from "../../types/domain";
import { MockCommunicationProvider } from "./mock";
import type { CommunicationProvider, ItemizedBillRequestContext } from "./provider";

const FISH_CALL_URL = "https://api.fish.audio/v1/agent/phone-calls";
const E164_NUMBER = /^\+[1-9]\d{7,14}$/;

export function fishCallIdempotencyKey(caseId: string, toNumber: string) {
  const destinationFingerprint = createHash("sha256").update(toNumber.trim()).digest("hex").slice(0, 16);
  return `medical-bill-guardian:${caseId}:request-itemized-bill:${destinationFingerprint}`;
}

export type FishDemoConfig = {
  apiKey: string;
  agentId: string;
  phoneNumberId: string;
  toNumber: string;
};

export class FishCallError extends Error {
  constructor(public readonly status: number, public readonly responseBody: string) {
    super(`Fish Audio call failed with HTTP ${status}: ${responseBody}`);
    this.name = "FishCallError";
  }
}

const missingConfig = (config: FishDemoConfig) => [
  ["FISH_API_KEY", config.apiKey],
  ["FISH_AGENT_ID", config.agentId],
  ["FISH_PHONE_NUMBER_ID", config.phoneNumberId],
  ["FISH_TEST_TO_NUMBER", config.toNumber],
].filter(([, value]) => !value.trim()).map(([name]) => name);

const redact = (value: string, config: FishDemoConfig) => {
  let safe = value;
  for (const secret of [config.apiKey, config.toNumber]) {
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
  constructor(
    private readonly config: FishDemoConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly fallback = new MockCommunicationProvider(),
  ) {}

  async requestItemizedBill({ caseId, providerName }: ItemizedBillRequestContext): Promise<Communication> {
    const missing = missingConfig(this.config);
    if (missing.length) throw new Error(`Missing Fish Audio configuration: ${missing.join(", ")}`);
    if (!E164_NUMBER.test(this.config.toNumber)) {
      throw new Error("FISH_TEST_TO_NUMBER must be a valid E.164 phone number");
    }

    let response: Response;
    try {
      response = await this.fetcher(FISH_CALL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": fishCallIdempotencyKey(caseId, this.config.toNumber),
        },
        body: JSON.stringify({
          agent_id: this.config.agentId,
          phone_number_id: this.config.phoneNumberId,
          to_number: this.config.toNumber,
        }),
      });
    } catch (cause) {
      const detail = cause instanceof Error ? redact(cause.message, this.config) : "Unknown network error";
      throw new Error(`Fish Audio call could not be queued: ${detail}`);
    }

    const responseBody = await readSafeBody(response, this.config);
    if (response.status !== 201) throw new FishCallError(response.status, responseBody);

    let sessionId: string | undefined;
    try {
      const parsed = JSON.parse(responseBody) as { session_id?: unknown };
      if (typeof parsed.session_id === "string" && parsed.session_id.trim()) sessionId = parsed.session_id;
    } catch {
      // The safe response body is included in the typed error below.
    }
    if (!sessionId) throw new FishCallError(201, responseBody);

    const ending = this.config.toNumber.slice(-4);
    return {
      id: crypto.randomUUID(),
      type: "ITEMIZED_BILL_REQUEST",
      timestamp: new Date().toISOString(),
      status: "PENDING",
      transcript: `AI demo call to ${providerName} billing at the configured consenting recipient ending ${ending}, requesting an itemized statement with service dates, codes, charges, adjustments, and patient responsibility.`,
      result: `Fish call queued · session ${sessionId}`,
    };
  }

  getItemizedBill(providerName: string, request: Communication) {
    return this.fallback.getItemizedBill(providerName, request);
  }

  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[]) {
    return this.fallback.requestBillingReview(providerName, invoiceId, findings);
  }

  notifyUser(summary: string) {
    return this.fallback.notifyUser(summary);
  }
}
