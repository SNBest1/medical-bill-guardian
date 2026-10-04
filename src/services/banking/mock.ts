import { demoTransaction } from "../demo";
import { getScenario } from "../scenarios";
import type { BankProvider } from "./provider";

export class MockBankProvider implements BankProvider {
  constructor(private readonly scenarioId?: string) {}

  /** Returns the picked scenario's payment, or the original seeded hospital payment when none is picked. */
  async getTransactions() {
    if (!this.scenarioId) return [demoTransaction];
    const scenario = getScenario(this.scenarioId);
    if (!scenario) throw new Error(`Unknown scenario: ${this.scenarioId}`);
    return [scenario.transaction];
  }
}
