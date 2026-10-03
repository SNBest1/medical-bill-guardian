import { demoTransaction } from "../demo";
import type { BankProvider } from "./provider";

export class MockBankProvider implements BankProvider {
  /** Returns the seeded hospital payment. */
  async getTransactions() { return [demoTransaction]; }
}
