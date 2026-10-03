import type { Transaction } from "../../types/domain";
import type { BankProvider } from "./provider";

type NessiePurchase = { _id: string; merchant_id?: string; description?: string; amount: number; purchase_date: string };

/** Keeps the merchant's name separate from the bank purchase description. */
export function normalizeNessiePurchase(purchase: NessiePurchase, merchantName: string): Transaction {
  return { id: purchase._id, merchant: merchantName, amount: purchase.amount, date: purchase.purchase_date.slice(0, 10) };
}

export class NessieBankProvider implements BankProvider {
  /** Fetches purchases from the configured Nessie sandbox customer. */
  async getTransactions(): Promise<Transaction[]> {
    const key = process.env.NESSIE_API_KEY;
    const customer = process.env.NESSIE_CUSTOMER_ID;
    const base = process.env.NESSIE_BASE_URL;
    if (!key || !customer || !base) throw new Error("Nessie key, customer ID, and HTTPS base URL are required");
    if (new URL(base).protocol !== "https:") throw new Error("Nessie requires an HTTPS endpoint");
    const get = async <T>(path: string): Promise<T> => {
      const url = new URL(`${base.replace(/\/$/, "")}${path}`);
      url.searchParams.set("key", key);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Nessie request failed: ${response.status}`);
      return response.json() as Promise<T>;
    };
    const accounts = await get<{ _id: string }[]>(`/customers/${encodeURIComponent(customer)}/accounts`);
    const purchases = (await Promise.all(accounts.map((account) => get<NessiePurchase[]>(`/accounts/${encodeURIComponent(account._id)}/purchases`)))).flat();
    const merchantIds = [...new Set(purchases.map((purchase) => purchase.merchant_id).filter((id): id is string => Boolean(id)))];
    const merchants = new Map(await Promise.all(merchantIds.map(async (id): Promise<[string, string]> => [id, (await get<{ name: string }>(`/merchants/${encodeURIComponent(id)}`)).name])));
    return purchases.map((purchase) => normalizeNessiePurchase(purchase, purchase.merchant_id ? merchants.get(purchase.merchant_id) || "Unknown merchant" : purchase.description || "Unknown merchant"));
  }
}
