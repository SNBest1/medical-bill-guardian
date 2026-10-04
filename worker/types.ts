/** Server-only bindings for the email and sandbox Worker. */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SPACETIME_HTTP_URL?: string;
  SPACETIME_DB_NAME?: string;
  SPACETIME_OWNER_TOKEN?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  EMAIL_SEND_ENABLED?: string;
  /** Rolling 24-hour cap on real emails sent (default 20). */
  EMAIL_DAILY_LIMIT?: string;
  PROVIDER_REPLY_EMAIL?: string;
  NESSIE_API_KEY?: string;
  NESSIE_CUSTOMER_ID?: string;
  NESSIE_BASE_URL?: string;
  FINCHNODE_API_KEY?: string;
  FINCHNODE_SUBJECT?: string;
  FINCHNODE_BASE_URL?: string;
}

/** Minimal Cloudflare Email Routing message shape used by the handler. */
export interface InboundMessage {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream<Uint8Array>;
  rawSize: number;
  setReject(reason: string): void;
}
