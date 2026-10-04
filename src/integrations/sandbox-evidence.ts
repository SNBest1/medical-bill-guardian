import { DEMO_RECORDS, DEMO_TRANSACTION } from "../../spacetimedb/src/logic/fixtures";
import { isHealthcareTransaction } from "../services/banking/provider";
import { normalizeNessiePurchase } from "../services/banking/nessie";
import { normalizeFinchRecords } from "../services/medical/finchnode";
import type { MedicalRecord, Transaction } from "../types/domain";

export type SandboxConfig = {
  NESSIE_API_KEY?: string;
  NESSIE_CUSTOMER_ID?: string;
  NESSIE_BASE_URL?: string;
  FINCHNODE_API_KEY?: string;
  FINCHNODE_SUBJECT?: string;
  FINCHNODE_BASE_URL?: string;
};

export type SandboxEvidence = {
  transaction: Transaction;
  transactionSource: "NESSIE_SANDBOX" | "MOCK";
  records: MedicalRecord[];
  recordsSource: "FINCHNODE_SANDBOX" | "MOCK" | "NONE";
  fallbackReason?: string;
};

type Purchase = { _id: string; merchant_id?: string; description?: string; amount: number; purchase_date: string };

const mockEvidence = (reason: string): SandboxEvidence => ({
  transaction: { id: DEMO_TRANSACTION.id, merchant: DEMO_TRANSACTION.merchant, amount: DEMO_TRANSACTION.amountCents / 100, date: DEMO_TRANSACTION.date, category: "healthcare" },
  transactionSource: "MOCK",
  records: DEMO_RECORDS.map((record, index) => ({ id: `mock-${index + 1}`, type: record.kind, description: record.description, date: record.date, provider: record.provider })),
  recordsSource: "MOCK",
  fallbackReason: reason
});

/** Reads one likely hospital sandbox payment; never sends mock records as proof for a real purchase. */
export async function getSandboxEvidence(config: SandboxConfig, request: typeof fetch = fetch): Promise<SandboxEvidence> {
  const { NESSIE_API_KEY: key, NESSIE_CUSTOMER_ID: customer, NESSIE_BASE_URL: base } = config;
  if (!key || !customer || !base) return mockEvidence("Nessie is not configured");
  try {
    if (new URL(base).protocol !== "https:") return mockEvidence("Nessie HTTPS origin is required");
  } catch {
    return mockEvidence("Nessie HTTPS origin is required");
  }

  const getNessie = async <T>(path: string): Promise<T> => {
    const url = new URL(`${base.replace(/\/$/, "")}${path}`);
    url.searchParams.set("key", key);
    const response = await request(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Nessie returned ${response.status}`);
    return response.json() as Promise<T>;
  };

  let transaction: Transaction | undefined;
  try {
    const accounts = await getNessie<{ _id: string }[]>(`/customers/${encodeURIComponent(customer)}/accounts`);
    const purchases = (await Promise.all(accounts.map((account) => getNessie<Purchase[]>(`/accounts/${encodeURIComponent(account._id)}/purchases`)))).flat();
    const merchants = new Map<string, { name: string; category?: string }>();
    for (const id of new Set(purchases.map((purchase) => purchase.merchant_id).filter((id): id is string => Boolean(id)))) {
      merchants.set(id, await getNessie<{ name: string; category?: string }>(`/merchants/${encodeURIComponent(id)}`));
    }
    transaction = purchases.map((purchase) => {
      const merchant = purchase.merchant_id ? merchants.get(purchase.merchant_id) : undefined;
      return { ...normalizeNessiePurchase(purchase, merchant?.name || purchase.description || "Unknown merchant"), category: merchant?.category };
    }).filter((item) => item.amount > 0 && isHealthcareTransaction(item)).sort((a, b) => b.date.localeCompare(a.date))[0];
  } catch {
    return mockEvidence("Nessie sandbox is unavailable");
  }
  if (!transaction) return mockEvidence("No healthcare purchase was found in Nessie");

  const { FINCHNODE_API_KEY: finchKey, FINCHNODE_SUBJECT: subject } = config;
  if (!finchKey || !subject) return { transaction, transactionSource: "NESSIE_SANDBOX", records: [], recordsSource: "NONE", fallbackReason: "No consented FinchNode subject is configured" };
  try {
    const finchBase = config.FINCHNODE_BASE_URL || "https://api.finchnode.com/api/v1";
    if (new URL(finchBase).protocol !== "https:") throw new Error("FinchNode HTTPS origin is required");
    const url = new URL(`${finchBase.replace(/\/$/, "")}/users/${encodeURIComponent(subject)}/records`);
    url.searchParams.set("categories", "encounters,medications,labs,documents,claims");
    const response = await request(url.toString(), { headers: { Authorization: `Bearer ${finchKey}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`FinchNode returned ${response.status}`);
    const snapshot = await response.json();
    const merchant = transaction.merchant.toLowerCase().replace(/[^a-z0-9]/g, "");
    const paymentDate = Date.parse(`${transaction.date}T00:00:00Z`);
    const records = normalizeFinchRecords(snapshot).filter((record) => {
      const provider = record.provider.toLowerCase().replace(/[^a-z0-9]/g, "");
      const days = (paymentDate - Date.parse(`${record.date}T00:00:00Z`)) / 86400000;
      return (merchant.includes(provider) || provider.includes(merchant)) && days >= 0 && days <= 14;
    });
    return { transaction, transactionSource: "NESSIE_SANDBOX", records, recordsSource: "FINCHNODE_SANDBOX" };
  } catch {
    return { transaction, transactionSource: "NESSIE_SANDBOX", records: [], recordsSource: "NONE", fallbackReason: "FinchNode records are unavailable" };
  }
}
