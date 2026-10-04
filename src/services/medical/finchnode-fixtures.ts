import morgan from "./fixtures/patient-demo-001.json";
import harriet from "./fixtures/patient-demo-polypharmacy.json";
import theo from "./fixtures/patient-demo-pediatric-asthma.json";
import type { FinchSnapshot } from "./finchnode";

/**
 * Trimmed copies of real responses from the keyless FinchNode public demo API
 * (GET /demo/v1/users/{subject}/records), saved 2026-10-04. They are the offline fallback and the
 * test data. Server-side only: do not import this from a client component.
 */
const saved: Record<string, FinchSnapshot> = {
  "patient-demo-001": morgan as unknown as FinchSnapshot,
  "patient-demo-polypharmacy": harriet as unknown as FinchSnapshot,
  "patient-demo-pediatric-asthma": theo as unknown as FinchSnapshot
};

export const savedSnapshot = (subject: string): FinchSnapshot | undefined => saved[subject];
export const savedSubjects = (): string[] => Object.keys(saved);
