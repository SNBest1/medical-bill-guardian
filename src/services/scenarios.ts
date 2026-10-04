import type { Scenario } from "./scenario-data";
import { scenarios } from "./scenario-data";
import type { Transaction } from "../types/domain";
import { demoRecords, demoStatement, demoTransaction } from "./demo";

export type { Scenario };
export { scenarios };

/** The original single-hospital rehearsal case; not offered in the judge picker but still supported. */
export const legacyScenario: Scenario = {
  id: "university-er",
  label: "Emergency room visit",
  accident: "Original rehearsal case: an emergency room visit after an accident.",
  patient: { firstName: "Demo", lastName: "Patient", street: "1 Main Street", city: "Ann Arbor", state: "MI", zip: "48104" },
  hospital: { name: "University Hospital", street: "1500 Medical Center Drive", city: "Ann Arbor", state: "MI", zip: "48109", lat: 42.28, lng: -83.73 },
  transaction: demoTransaction,
  records: demoRecords,
  statement: demoStatement,
  outcome: { flagged: "Specialist consultation", result: "DUPLICATE_REMOVED", explanation: "The hospital confirmed that the $700 specialist consultation duplicated services already included in the emergency room charge and removed it." }
};

const fixtures = [...scenarios, legacyScenario];

export const getScenario = (id: string): Scenario | undefined => fixtures.find((scenario) => scenario.id === id);

/** Finds the fixture for a payment by ID, or by merchant, amount, and date when the ID came from Nessie. */
export const scenarioForTransaction = (transaction: Transaction): Scenario | undefined =>
  fixtures.find((scenario) => scenario.transaction.id === transaction.id || (scenario.transaction.merchant === transaction.merchant && scenario.transaction.amount === transaction.amount && scenario.transaction.date === transaction.date));

export const scenarioForProvider = (providerName: string): Scenario | undefined => fixtures.find((scenario) => scenario.hospital.name === providerName);

/** True only for payments that have matching synthetic records, bill, and hospital reply. */
export const isDemoTransaction = (transaction: Transaction): boolean => Boolean(scenarioForTransaction(transaction));
