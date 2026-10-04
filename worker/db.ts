import type { Env } from "./types";
import type { EmailKind, OutboundEmail } from "./resend";

type Row = Record<string, unknown>;
type SqlResult = { schema: { elements: { name: { some?: string } }[] }; rows: (unknown[] | Row)[] };

function baseUrl(env: Env): string {
  if (!env.SPACETIME_HTTP_URL || !env.SPACETIME_DB_NAME || !env.SPACETIME_OWNER_TOKEN) throw new Error("SpacetimeDB Worker credentials are not configured");
  return `${env.SPACETIME_HTTP_URL.replace(/\/$/, "")}/v1/database/${encodeURIComponent(env.SPACETIME_DB_NAME)}`;
}

/** Runs a server-owned SQL query and decodes SpacetimeDB's named product rows. */
export async function sqlRows(env: Env, query: string, fetcher: typeof fetch = fetch): Promise<Row[]> {
  const response = await fetcher(`${baseUrl(env)}/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SPACETIME_OWNER_TOKEN}`, "Content-Type": "text/plain" },
    body: query,
  });
  if (!response.ok) throw new Error(`SpacetimeDB SQL failed (${response.status})`);
  const results = await response.json() as SqlResult[];
  const first = results[0];
  if (!first?.schema?.elements || !Array.isArray(first.rows)) throw new Error("SpacetimeDB SQL response was malformed");
  return first.rows.map((row) => {
    if (!Array.isArray(row)) return Object.fromEntries(Object.entries(row).map(([name, value]) => [name.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()), value]));
    return Object.fromEntries(first.schema.elements.map((element, index) => [
      (element.name.some ?? String(index)).replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()), row[index],
    ]));
  });
}

/** Calls a trusted reducer using only the Worker-held database owner token. */
export async function callReducer(env: Env, reducer: string, args: unknown[], fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher(`${baseUrl(env)}/call/${encodeURIComponent(reducer)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SPACETIME_OWNER_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`SpacetimeDB ${reducer} failed (${response.status})`);
}

export interface PendingEmail extends OutboundEmail { communicationId: string }

/** Finds only explicitly authorized real-email work; mock communications have other kinds. */
export async function pendingEmails(env: Env): Promise<PendingEmail[]> {
  const communications = await sqlRows(env, "SELECT * FROM communication WHERE status = 'PENDING'");
  const relevant = communications.filter((row) => row.kind === "EMAIL_ITEMIZED_BILL_REQUEST" || row.kind === "EMAIL_BILLING_REVIEW");
  if (!relevant.length) return [];
  const cases = await sqlRows(env, "SELECT * FROM bill_case");
  return relevant.flatMap((row) => {
    const found = cases.find((candidate) => String(candidate.id) === String(row.caseId));
    const kind = row.kind as EmailKind;
    const expected = kind === "EMAIL_ITEMIZED_BILL_REQUEST" ? "WAITING_FOR_BILL" : "WAITING_FOR_PROVIDER";
    if (!found || found.status !== expected) return [];
    return [{
      communicationId: String(row.id), caseId: String(row.caseId), kind,
      merchant: String(found.merchant), paidOn: String(found.paidOn),
      invoiceId: found.invoiceId ? String(found.invoiceId) : undefined,
    }];
  });
}

/** Confirms a correlated case is awaiting a provider email before ingesting. */
export async function inboundKind(env: Env, caseId: string): Promise<"bill" | "review" | null> {
  const cases = await sqlRows(env, `SELECT * FROM bill_case WHERE id = ${caseId}`);
  const row = cases[0];
  if (!row) return null;
  const communications = (await sqlRows(env, "SELECT * FROM communication")).filter((entry) => String(entry.caseId) === caseId);
  if (row.status === "WAITING_FOR_BILL" && communications.some((entry) => entry.kind === "EMAIL_ITEMIZED_BILL_REQUEST" && entry.status === "SENT")) return "bill";
  if (row.status === "WAITING_FOR_PROVIDER" && communications.some((entry) => entry.kind === "EMAIL_BILLING_REVIEW" && entry.status === "SENT")) return "review";
  return null;
}
