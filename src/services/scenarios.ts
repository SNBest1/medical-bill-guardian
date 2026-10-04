import type { MedicalRecord, Transaction } from "../types/domain";

/** One synthetic accident the judges can pick. Everything downstream (Nessie seed, records, bill, hospital reply) derives from it. */
export interface Scenario {
  id: string;
  label: string;
  accident: string;
  patient: { firstName: string; lastName: string; street: string; city: string; state: string; zip: string };
  hospital: { name: string; street: string; city: string; state: string; zip: string; lat: number; lng: number };
  transaction: Transaction;
  records: MedicalRecord[];
  statement: string;
  /** What the mock hospital says after the patient authorizes review. */
  outcome: { flagged: string | null; result: "DUPLICATE_REMOVED" | "CHARGE_VERIFIED" | null; explanation: string };
}

const record = (hospital: string, date: string, id: string, type: MedicalRecord["type"], description: string): MedicalRecord => ({ id, type, description, date, provider: hospital });

const lakeside = "Lakeside Regional Medical Center";
const summit = "Summit Trauma Hospital";
const alpine = "Alpine Urgent Care Clinic";

export const scenarios: Scenario[] = [
  {
    id: "bike-wrist",
    label: "Cycling crash: broken wrist",
    accident: "Maya Ortiz was hit by a car door while cycling and fractured her left wrist.",
    patient: { firstName: "Maya", lastName: "Ortiz", street: "412 Alder Street", city: "Portland", state: "OR", zip: "97205" },
    hospital: { name: lakeside, street: "1800 Lakeshore Drive", city: "Portland", state: "OR", zip: "97209", lat: 45.52, lng: -122.68 },
    transaction: { id: "scenario-bike-wrist", merchant: lakeside, amount: 3140, date: "2026-09-14", category: "healthcare" },
    records: [
      record(lakeside, "2026-09-14", "bw-er", "encounter", "Emergency room visit after cycling crash"),
      record(lakeside, "2026-09-14", "bw-xray", "imaging", "Wrist X-ray radiology report"),
      record(lakeside, "2026-09-14", "bw-splint", "procedure", "Fracture splinting procedure note"),
      record(lakeside, "2026-09-14", "bw-med", "medication", "Pain medication administered in ER")
    ],
    statement: `Invoice: LR-20931
Provider: ${lakeside}
Service date: 2026-09-14
Insurance adjustments: 0.00
Patient responsibility: 3140.00
Charges
Emergency room | 99284 | 1050.00
Wrist X-ray | - | 380.00
Fracture splinting | - | 920.00
Pain medication | - | 140.00
Orthopedic consultation | - | 650.00
Total: 3140.00`,
    outcome: { flagged: "Orthopedic consultation", result: "DUPLICATE_REMOVED", explanation: "The hospital confirmed the $650 orthopedic consultation duplicated the evaluation already included in the emergency room charge and removed it." }
  },
  {
    id: "car-concussion",
    label: "Car collision: concussion",
    accident: "Daniel Brooks was rear-ended on the highway and treated for a concussion and neck pain.",
    patient: { firstName: "Daniel", lastName: "Brooks", street: "88 Harbor View Road", city: "Seattle", state: "WA", zip: "98101" },
    hospital: { name: summit, street: "500 Summit Avenue", city: "Seattle", state: "WA", zip: "98104", lat: 47.61, lng: -122.33 },
    transaction: { id: "scenario-car-concussion", merchant: summit, amount: 6760, date: "2026-09-21", category: "healthcare" },
    records: [
      record(summit, "2026-09-21", "cc-er", "encounter", "Emergency room visit after car collision"),
      record(summit, "2026-09-21", "cc-head", "imaging", "Head CT scan report"),
      record(summit, "2026-09-21", "cc-neck", "imaging", "Cervical spine CT report"),
      record(summit, "2026-09-21", "cc-iv", "medication", "IV medication administered in ER")
    ],
    statement: `Invoice: ST-77140
Provider: ${summit}
Service date: 2026-09-21
Insurance adjustments: 0.00
Patient responsibility: 6760.00
Charges
Emergency room | 99285 | 1400.00
Head CT | - | 1750.00
Cervical spine CT | - | 1500.00
IV medication | - | 210.00
Brain MRI | - | 1900.00
Total: 6760.00`,
    outcome: { flagged: "Brain MRI", result: "CHARGE_VERIFIED", explanation: "The hospital located a signed MRI order and radiology read filed under a different record number. The $1,900 charge is valid and stands." }
  },
  {
    id: "ski-ankle",
    label: "Skiing fall: sprained ankle",
    accident: "Priya Nair twisted her ankle on a ski run and went to urgent care. Nothing is wrong with this bill.",
    patient: { firstName: "Priya", lastName: "Nair", street: "27 Pine Ridge Lane", city: "Denver", state: "CO", zip: "80202" },
    hospital: { name: alpine, street: "9 Mountain Plaza", city: "Denver", state: "CO", zip: "80205", lat: 39.74, lng: -104.99 },
    transaction: { id: "scenario-ski-ankle", merchant: alpine, amount: 1145, date: "2026-09-06", category: "healthcare" },
    records: [
      record(alpine, "2026-09-06", "sa-visit", "encounter", "Urgent care visit after skiing fall"),
      record(alpine, "2026-09-06", "sa-xray", "imaging", "Ankle X-ray radiology report"),
      record(alpine, "2026-09-06", "sa-splint", "procedure", "Ankle splint application procedure note"),
      record(alpine, "2026-09-06", "sa-crutch", "document", "Crutches provided and fitting note")
    ],
    statement: `Invoice: AU-30518
Provider: ${alpine}
Service date: 2026-09-06
Insurance adjustments: 0.00
Patient responsibility: 1145.00
Charges
Urgent care visit | 99283 | 480.00
Ankle X-ray | - | 360.00
Ankle splint | - | 210.00
Crutches | - | 95.00
Total: 1145.00`,
    outcome: { flagged: null, result: null, explanation: "Every charge is supported by the clinical record; no provider contact is needed." }
  }
];

export const getScenario = (id: string): Scenario | undefined => scenarios.find((scenario) => scenario.id === id);
