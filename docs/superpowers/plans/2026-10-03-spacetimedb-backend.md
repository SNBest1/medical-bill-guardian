# SpacetimeDB Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Medical Bill Guardian's backend into a SpacetimeDB TypeScript module on Maincloud and replace the Next.js app with a Vite React client on Cloudflare that updates live from per-user views.

**Architecture:** Pure billing logic (parse, match, reconcile, summarize, money formatting) lives in `spacetimedb/src/logic/` as plain TypeScript with no SpacetimeDB imports, so Vitest tests it directly and both the module and client can import it. The module (`spacetimedb/src/schema.ts` + `index.ts`) stores each case as rows across private tables, runs the state machine in reducers, delivers the demo bill from a scheduled reducer, and exposes data only through views filtered by `ctx.sender`. The Vite client subscribes to those views and reassembles the existing `MedicalBillCase` display shape, so the ported components change little.

**Tech Stack:** SpacetimeDB 2.10.2 (TypeScript module + `spacetimedb/react` client SDK), React 19.1.1, Vite 8.3.2, @vitejs/plugin-react 6.1.1, TypeScript 5.9.2, Vitest 4.1.11, Cloudflare Workers static assets via wrangler 4.147.0.

**Spec:** `docs/superpowers/specs/2026-10-03-spacetimedb-backend-design.md`

## Global Constraints

- Branch: `feat/spacetimedb-backend`. Commit at the end of every task with a focused message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Dependencies are pinned to exact versions (no `^`, `~`, or `*`).
- The SpacetimeDB CLI lives at `~/.local/bin/spacetime`; prefix shell commands with `export PATH="$HOME/.local/bin:$PATH"` if `spacetime` is not found.
- All tables are private (no `public: true` on any `table(...)`). Only views are public.
- Money is integer cents everywhere in the module and logic. Dollars appear only in display formatting.
- Reducers never use `Date`, `Math.random`, `crypto.randomUUID`, or `Intl`/`toLocaleString`; time comes from `ctx.timestamp`. Logic shared with the module follows the same rule.
- A missing clinical match is "needs review", never "error" or "fraud". Provider contact happens only in `authorize_review`, which requires the case owner.
- Synthetic demo data only. The module contains no network calls.
- Every Maincloud publish and every Cloudflare deploy needs the user's explicit yes in chat first.
- Never print or commit `.env`, `.env.local`, or tokens.
- Docs (README, CLAUDE.md, AGENTS.md, PROJECT_CHECKLIST.md, `.env.example`) are updated in the same commit as the code they describe.

## Review Focus

1. **Two browser tabs with the same identity** — both see the same case; clicking Investigate in one updates the other without errors, and a second Investigate click is a silent no-op.
2. **Restart demo while the bill is still pending** — the pending `bill_delivery` row is deleted with the case, so no bill lands on a deleted or fresh case.
3. **A different identity calling `authorize_review` or `investigate_case` with someone else's case id** — rejected with `SenderError`; nothing changes.
4. **A client calling `deliver_bill` directly** — rejected; the bill cannot be forced early.
5. **Money edge cases** — `formatDollars` renders `412000` as `$4,120`, `70050` as `$700.50`, `0` as `$0`; the total-mismatch check uses exact cents.

Items 1–3 are pinned by the smoke script (Task 3 Step 1), item 4 by Task 3 Step 4, and item 5 by the money and reconcile tests in Task 1.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `spacetimedb/package.json`, `spacetimedb/tsconfig.json` | Module package (exact `spacetimedb` pin) |
| `spacetimedb/src/logic/types.ts` | Cents-based logic types and status unions |
| `spacetimedb/src/logic/money.ts` (+ test) | `toCents`, `formatDollars` without `Intl` |
| `spacetimedb/src/logic/fixtures.ts` | Demo transaction, records, statement, mock provider texts and resolution |
| `spacetimedb/src/logic/parse-bill.ts` (+ test) | Plain-text statement → `ParsedBill` |
| `spacetimedb/src/logic/matcher.ts` (+ test) | Payment → encounter record |
| `spacetimedb/src/logic/reconcile.ts` (+ test) | Bill lines × records → findings |
| `spacetimedb/src/logic/summary.ts` (+ test) | Deterministic plain-language summary |
| `spacetimedb/src/schema.ts` | Tables, `Resolution` type, schema default export |
| `spacetimedb/src/index.ts` | Reducers, scheduled reducer, views; re-exports schema |
| `scripts/smoke.sh` | End-to-end story against a throwaway local server |
| `index.html`, `vite.config.ts`, `src/vite-env.d.ts` | Vite entry and config |
| `src/main.tsx` | Connection builder + `SpacetimeDBProvider` |
| `src/App.tsx` | Subscribes to views, routes between dashboard and case |
| `src/lib/assemble.ts` (+ test) | View rows → `MedicalBillCase[]` (dollars) |
| `src/components/Dashboard.tsx`, `CaseView.tsx`, `CaseActivity.tsx` | Ported UI; props instead of `fetch` |
| `src/styles.css` | Moved from `src/app/globals.css` |
| `src/module_bindings/` | Generated by `spacetime generate`; committed |
| `src/types/domain.ts` | Kept as the client display model (dollars); still used by reference adapters |
| `wrangler.jsonc` | Cloudflare static-assets deploy |

Deleted in Task 4: `src/app/`, `src/lib/db.ts`, `src/lib/db.test.ts`, `src/lib/providers.ts`, `src/proxy.ts`, `src/proxy.test.ts`, `src/services/agent/`, `src/services/communications/`, `src/services/reconciliation/`, `src/services/demo.ts`, `src/services/banking/mock.ts`, `src/services/medical/mock.ts`, `next-env.d.ts`. Kept as unbundled reference: `src/services/banking/{nessie,provider}.ts` (+ test), `src/services/medical/{finchnode,provider}.ts` (+ test).

---

### Task 1: Pure logic package in cents

**Files:**
- Create: `spacetimedb/package.json`, `spacetimedb/tsconfig.json`, `spacetimedb/src/logic/types.ts`, `money.ts`, `money.test.ts`, `fixtures.ts`, `parse-bill.ts`, `parse-bill.test.ts`, `matcher.ts`, `matcher.test.ts`, `reconcile.ts`, `reconcile.test.ts`, `summary.ts`, `summary.test.ts`
- Modify: `tsconfig.json` (root) — add `spacetimedb/src` to `include`, exclude `spacetimedb/node_modules`
- Modify: `.gitignore` — add `spacetimedb/node_modules/`, `dist/`, `.wrangler/`

**Interfaces:**
- Produces (all exported from `spacetimedb/src/logic/*`):
  - `types.ts`: `CaseStatus`, `ClinicalStatus`, `RecordKind`, `RecordInput { kind; description; date; provider }`, `BillLine { description; code?: string; amountCents: number; serviceDate: string }`, `ParsedBill { invoiceId; provider; totalCents: number; items: BillLine[] }`, `FindingInput { lineIndex: number | null; description; amountCents; clinicalStatus; pricingStatus: "NOT_ASSESSED" | "REVIEW"; confidence: number; evidence: string[]; explanation; action: "NONE" | "REQUEST_REVIEW" }`, `ResolutionInput { result: "DUPLICATE_REMOVED" | "CHARGE_VERIFIED" | "PROVIDER_REVIEW_PENDING" | "UNRESOLVED"; originalTotalCents; correctedTotalCents; adjustmentCents; explanation }`
  - `money.ts`: `toCents(text: string): number`, `formatDollars(cents: number): string`
  - `fixtures.ts`: `DEMO_TRANSACTION`, `DEMO_CASE_LABEL`, `DEMO_RECORDS`, `DEMO_STATEMENT`, `BILL_DELAY_MICROS`, `billRequestTranscript(provider)`, `billingReview(provider, invoiceId, description)`, `notificationTranscript`
  - `parseItemizedBill(statement: string): ParsedBill`
  - `matchEncounter(payment: { merchant: string; date: string }, records: RecordInput[]): RecordInput | null`
  - `reconcile(bill: ParsedBill, records: RecordInput[]): FindingInput[]`
  - `buildSummary(input: { provider: string; supported: number; questioned: { description: string; amountCents: number }[]; resolution: ResolutionInput | null }): string`

- [ ] **Step 1: Create the module package files**

`spacetimedb/package.json`:
```json
{
  "name": "medical-bill-guardian-module",
  "private": true,
  "type": "module",
  "dependencies": { "spacetimedb": "2.10.2" },
  "devDependencies": { "typescript": "5.9.2" }
}
```

`spacetimedb/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

Run: `npm install --prefix spacetimedb` — Expected: creates `spacetimedb/package-lock.json`, no errors.

Root `tsconfig.json`: change `"include"` to `["src", "spacetimedb/src", "*.ts"]` and `"exclude"` to `["node_modules", "spacetimedb/node_modules", "dist"]`. (Next.js plugin entries are removed in Task 4.)

Append to `.gitignore`:
```
spacetimedb/node_modules/
dist/
.wrangler/
```

- [ ] **Step 2: Write `types.ts`**

```ts
export type CaseStatus = "DETECTED" | "FETCHING_RECORDS" | "REQUESTING_BILL" | "WAITING_FOR_BILL" | "ANALYZING" | "REVIEW_REQUIRED" | "CONTACTING_PROVIDER" | "WAITING_FOR_PROVIDER" | "RESOLVED" | "USER_NOTIFIED" | "FAILED";
export type ClinicalStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NO_MATCH_FOUND" | "DUPLICATE_SUSPECTED" | "DATE_MISMATCH" | "AMOUNT_REVIEW" | "INSUFFICIENT_DATA";
export type RecordKind = "encounter" | "imaging" | "procedure" | "medication" | "lab" | "document";

export interface RecordInput { kind: RecordKind; description: string; date: string; provider: string }
export interface BillLine { description: string; code?: string; amountCents: number; serviceDate: string }
export interface ParsedBill { invoiceId: string; provider: string; totalCents: number; items: BillLine[] }
export interface FindingInput {
  /** Index into ParsedBill.items, or null for whole-bill findings such as a total mismatch. */
  lineIndex: number | null;
  description: string; amountCents: number; clinicalStatus: ClinicalStatus;
  pricingStatus: "NOT_ASSESSED" | "REVIEW"; confidence: number; evidence: string[];
  explanation: string; action: "NONE" | "REQUEST_REVIEW";
}
export interface ResolutionInput { result: "DUPLICATE_REMOVED" | "CHARGE_VERIFIED" | "PROVIDER_REVIEW_PENDING" | "UNRESOLVED"; originalTotalCents: number; correctedTotalCents: number; adjustmentCents: number; explanation: string }
```

- [ ] **Step 3: Write the failing money test** — `spacetimedb/src/logic/money.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatDollars, toCents } from "./money";

describe("money", () => {
  it("parses statement amounts into exact cents", () => {
    expect(toCents("4820.00")).toBe(482000);
    expect(toCents("700")).toBe(70000);
    expect(toCents("0.05")).toBe(5);
  });

  it("formats cents without Intl, dropping zero cents", () => {
    expect(formatDollars(412000)).toBe("$4,120");
    expect(formatDollars(70050)).toBe("$700.50");
    expect(formatDollars(0)).toBe("$0");
    expect(formatDollars(123456789)).toBe("$1,234,567.89");
  });
});
```

Run: `npx vitest run spacetimedb/src/logic/money.test.ts` — Expected: FAIL, cannot resolve `./money`.

- [ ] **Step 4: Implement `money.ts`**

```ts
/** Converts a validated decimal string ("4820.00") to integer cents without floating-point rounding. */
export function toCents(text: string): number {
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

/** Formats cents as dollars; avoids Intl because SpacetimeDB modules may not provide it. */
export function formatDollars(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = cents % 100;
  return rest ? `$${whole}.${rest.toString().padStart(2, "0")}` : `$${whole}`;
}
```

Run the test again — Expected: PASS (2 tests).

- [ ] **Step 5: Write `fixtures.ts`**

```ts
import type { RecordInput, ResolutionInput } from "./types";

export const DEMO_TRANSACTION = { id: "nessie-demo-4820", merchant: "University Hospital", amountCents: 482000, date: "2026-09-28" };
export const DEMO_CASE_LABEL = "CASE-4821";
/** The mock hospital's statement arrives this long after the bill request. */
export const BILL_DELAY_MICROS = 2_000_000n;

export const DEMO_RECORDS: RecordInput[] = [
  { kind: "encounter", description: "Emergency room visit after accident", date: "2026-09-28", provider: "University Hospital" },
  { kind: "imaging", description: "CT scan diagnostic report", date: "2026-09-28", provider: "University Hospital" },
  { kind: "imaging", description: "X-ray radiology report", date: "2026-09-28", provider: "University Hospital" },
  { kind: "procedure", description: "Laceration repair with sutures", date: "2026-09-28", provider: "University Hospital" },
  { kind: "medication", description: "Medication administered in ER", date: "2026-09-28", provider: "University Hospital" }
];

export const DEMO_STATEMENT = `Invoice: UH-48291
Provider: University Hospital
Service date: 2026-09-28
Insurance adjustments: 0.00
Patient responsibility: 4820.00
Charges
Emergency room | 99285 | 1100.00
CT scan | - | 1800.00
X-ray | - | 450.00
Suture repair | - | 600.00
Medication | - | 170.00
Specialist consultation | - | 700.00
Total: 4820.00`;

export const billRequestTranscript = (provider: string) => `Demo request to ${provider} billing for an itemized statement, service dates, codes, charges, adjustments, and patient responsibility.`;

/** The seeded provider confirmation returned after the patient authorizes review. */
export function billingReview(provider: string, invoiceId: string, description: string): { transcript: string; resolution: ResolutionInput } {
  return {
    transcript: `Demo request to ${provider} billing about invoice ${invoiceId}: verify the ${description} charge and provide documentation or a correction.`,
    resolution: { result: "DUPLICATE_REMOVED", originalTotalCents: 482000, correctedTotalCents: 412000, adjustmentCents: 70000, explanation: "The hospital confirmed that the $700 specialist consultation duplicated services already included in the emergency room charge and removed it." }
  };
}

export const notificationTranscript = "Demo in-app notification";
```

- [ ] **Step 6: Write the failing parse test** — `spacetimedb/src/logic/parse-bill.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseItemizedBill } from "./parse-bill";
import { DEMO_STATEMENT } from "./fixtures";

describe("parseItemizedBill", () => {
  it("turns the hospital statement into six charges in cents without inventing codes", () => {
    const bill = parseItemizedBill(DEMO_STATEMENT);
    expect(bill.invoiceId).toBe("UH-48291");
    expect(bill.items).toHaveLength(6);
    expect(bill.items[0].code).toBe("99285");
    expect(bill.items[5].code).toBeUndefined();
    expect(bill.items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(482000);
    expect(bill.totalCents).toBe(482000);
  });

  it("rejects a statement without a valid total", () => {
    expect(() => parseItemizedBill(DEMO_STATEMENT.replace("Total: 4820.00", "Total: unknown"))).toThrow(/total/i);
  });

  it("rejects a malformed charge line", () => {
    expect(() => parseItemizedBill(DEMO_STATEMENT.replace("X-ray | - | 450.00", "X-ray 450.00"))).toThrow(/charge on line 3/);
  });
});
```

Run: `npx vitest run spacetimedb/src/logic/parse-bill.test.ts` — Expected: FAIL, cannot resolve `./parse-bill`.

- [ ] **Step 7: Implement `parse-bill.ts`**

```ts
import { toCents } from "./money";
import type { ParsedBill } from "./types";

const AMOUNT = /^\d+(?:\.\d{2})?$/;

/** Parses the demo provider's plain-text statement into validated bill lines. */
export function parseItemizedBill(statement: string): ParsedBill {
  const lines = statement.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const field = (name: string) => lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2).trim();
  const invoiceId = field("Invoice");
  const provider = field("Provider");
  const serviceDate = field("Service date") ?? "";
  const totalText = field("Total") ?? "";
  const start = lines.indexOf("Charges");
  const end = lines.findIndex((line) => line.startsWith("Total: "));
  if (!invoiceId || !provider || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !AMOUNT.test(totalText) || start < 0 || end <= start + 1) throw new Error("Itemized statement is missing required bill fields or total");
  const items = lines.slice(start + 1, end).map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length !== 3 || !parts[0] || !AMOUNT.test(parts[2])) throw new Error(`Invalid itemized charge on line ${index + 1}`);
    return { description: parts[0], code: parts[1] === "-" ? undefined : parts[1], amountCents: toCents(parts[2]), serviceDate };
  });
  return { invoiceId, provider, totalCents: toCents(totalText), items };
}
```

Run the test — Expected: PASS (3 tests).

- [ ] **Step 8: Write the failing matcher test** — `spacetimedb/src/logic/matcher.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { matchEncounter } from "./matcher";
import { DEMO_RECORDS, DEMO_TRANSACTION } from "./fixtures";

describe("matchEncounter", () => {
  it("links a payment to a provider encounter within two weeks", () => {
    expect(matchEncounter(DEMO_TRANSACTION, DEMO_RECORDS)?.description).toBe("Emergency room visit after accident");
  });

  it("does not link an unrelated hospital visit", () => {
    expect(matchEncounter(DEMO_TRANSACTION, [{ ...DEMO_RECORDS[0], date: "2026-08-01", provider: "Other Clinic" }])).toBeNull();
  });
});
```

Run: `npx vitest run spacetimedb/src/logic/matcher.test.ts` — Expected: FAIL.

- [ ] **Step 9: Implement `matcher.ts`**

```ts
import type { RecordInput } from "./types";

const DAY_MS = 86_400_000;
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

/** Finds a provider encounter up to 14 days before the payment. Dates are compared as UTC calendar days. */
export function matchEncounter(payment: { merchant: string; date: string }, records: RecordInput[]): RecordInput | null {
  const merchant = normalize(payment.merchant);
  const paid = Date.parse(`${payment.date}T00:00:00Z`);
  return records.find((record) => {
    if (record.kind !== "encounter") return false;
    const provider = normalize(record.provider);
    const days = (paid - Date.parse(`${record.date}T00:00:00Z`)) / DAY_MS;
    return (provider.includes(merchant) || merchant.includes(provider)) && days >= 0 && days <= 14;
  }) ?? null;
}
```

`Date.parse` on a fixed ISO string is deterministic, so it is allowed here (the constraint bans reading the clock, not parsing dates). Run the test — Expected: PASS.

- [ ] **Step 10: Write the failing reconcile test** — `spacetimedb/src/logic/reconcile.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";
import { parseItemizedBill } from "./parse-bill";
import { DEMO_RECORDS, DEMO_STATEMENT } from "./fixtures";

const bill = parseItemizedBill(DEMO_STATEMENT);

describe("reconcile", () => {
  it("requires review when a charge has no matching clinical evidence", () => {
    const specialist = reconcile(bill, DEMO_RECORDS).find((item) => item.description === "Specialist consultation");
    expect(specialist?.clinicalStatus).toBe("NO_MATCH_FOUND");
    expect(specialist?.action).toBe("REQUEST_REVIEW");
    expect(specialist?.lineIndex).toBe(5);
    expect(specialist?.explanation).toMatch(/does not prove/i);
  });

  it("supports five documented services without inventing a price comparison", () => {
    const result = reconcile(bill, DEMO_RECORDS);
    expect(result.filter((item) => item.clinicalStatus === "SUPPORTED")).toHaveLength(5);
    expect(result.every((item) => item.pricingStatus === "NOT_ASSESSED")).toBe(true);
  });

  it("flags a one-cent total mismatch exactly", () => {
    const result = reconcile({ ...bill, totalCents: 481999 }, DEMO_RECORDS);
    const total = result.find((item) => item.clinicalStatus === "AMOUNT_REVIEW");
    expect(total?.lineIndex).toBeNull();
    expect(total?.evidence[0]).toBe("Line items total $4,820; stated total is $4,819.99.");
  });

  it("flags an exact duplicate line", () => {
    const doubled = { ...bill, items: [...bill.items, bill.items[1]] };
    expect(reconcile(doubled, DEMO_RECORDS)[6].clinicalStatus).toBe("DUPLICATE_SUSPECTED");
  });
});
```

Run: `npx vitest run spacetimedb/src/logic/reconcile.test.ts` — Expected: FAIL.

- [ ] **Step 11: Implement `reconcile.ts`**

```ts
import { formatDollars } from "./money";
import type { FindingInput, ParsedBill, RecordInput } from "./types";

// Demo-only synonyms. Unknown descriptions fall back to a literal substring match, so real bills will mostly need review.
const terms: Record<string, string[]> = {
  "Emergency room": ["emergency room", "er visit"],
  "CT scan": ["ct scan"],
  "X-ray": ["x-ray"],
  "Suture repair": ["suture", "laceration repair"],
  Medication: ["medication"],
  "Specialist consultation": ["specialist consultation", "specialist encounter"]
};

/** Compares billed services with the available clinical record without treating missing data as an error. */
export function reconcile(bill: ParsedBill, records: RecordInput[]): FindingInput[] {
  const seen = new Set<string>();
  const findings = bill.items.map((item, lineIndex): FindingInput => {
    const key = `${item.description.toLowerCase()}|${item.serviceDate}|${item.amountCents}`;
    const duplicate = seen.has(key);
    seen.add(key);
    const words = terms[item.description] ?? [item.description.toLowerCase()];
    const matches = records.filter((record) => words.some((word) => record.description.toLowerCase().includes(word)));
    const dated = matches.filter((record) => record.date === item.serviceDate);
    const clinicalStatus = duplicate ? "DUPLICATE_SUSPECTED" : dated.length ? "SUPPORTED" : matches.length ? "DATE_MISMATCH" : records.length ? "NO_MATCH_FOUND" : "INSUFFICIENT_DATA";
    return {
      lineIndex, description: item.description, amountCents: item.amountCents, clinicalStatus,
      pricingStatus: "NOT_ASSESSED", confidence: duplicate ? 0.9 : dated.length ? 0.97 : 0.35,
      evidence: dated.map((record) => `${record.description} (${record.date})`),
      explanation: clinicalStatus === "SUPPORTED" ? "A corresponding service appears in the available medical record." : clinicalStatus === "DUPLICATE_SUSPECTED" ? "A matching line item appears more than once; ask billing to verify it." : "No corresponding service was found in the available medical record. This does not prove the charge is incorrect.",
      action: clinicalStatus === "SUPPORTED" ? "NONE" : "REQUEST_REVIEW"
    };
  });
  const sum = bill.items.reduce((total, item) => total + item.amountCents, 0);
  if (sum !== bill.totalCents) findings.push({ lineIndex: null, description: "Bill total", amountCents: bill.totalCents, clinicalStatus: "AMOUNT_REVIEW", pricingStatus: "NOT_ASSESSED", confidence: 1, evidence: [`Line items total ${formatDollars(sum)}; stated total is ${formatDollars(bill.totalCents)}.`], explanation: "The itemized charges do not add up to the stated bill total.", action: "REQUEST_REVIEW" });
  return findings;
}
```

Run the test — Expected: PASS (4 tests).

- [ ] **Step 12: Write the failing summary test** — `spacetimedb/src/logic/summary.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildSummary } from "./summary";
import { billingReview } from "./fixtures";

describe("buildSummary", () => {
  it("explains the provider-confirmed correction in plain language", () => {
    const { resolution } = billingReview("University Hospital", "UH-48291", "Specialist consultation");
    const text = buildSummary({ provider: "University Hospital", supported: 5, questioned: [{ description: "Specialist consultation", amountCents: 70000 }], resolution });
    expect(text).toBe("We reviewed your University Hospital bill and compared its charges with your available medical records. 5 services had supporting records. We could not verify Specialist consultation ($700) from those records, so we asked hospital billing to review it. The hospital confirmed that the $700 specialist consultation duplicated services already included in the emergency room charge and removed it. The bill changed from $4,820 to $4,120, a $700 correction.");
  });

  it("does not mention a correction when every charge was supported", () => {
    const text = buildSummary({ provider: "University Hospital", supported: 1, questioned: [], resolution: null });
    expect(text).toBe("We reviewed your University Hospital bill and compared its charges with your available medical records. 1 service had supporting records.");
  });
});
```

Run: `npx vitest run spacetimedb/src/logic/summary.test.ts` — Expected: FAIL.

- [ ] **Step 13: Implement `summary.ts`**

```ts
import { formatDollars } from "./money";
import type { ResolutionInput } from "./types";

/** Builds the patient-facing summary from verified case facts only. */
export function buildSummary(input: { provider: string; supported: number; questioned: { description: string; amountCents: number }[]; resolution: ResolutionInput | null }): string {
  const { provider, supported, questioned, resolution } = input;
  const parts = [`We reviewed your ${provider} bill and compared its charges with your available medical records.`, `${supported} ${supported === 1 ? "service had" : "services had"} supporting records.`];
  if (questioned.length) parts.push(`We could not verify ${questioned.map((item) => `${item.description} (${formatDollars(item.amountCents)})`).join(", ")} from those records, so we asked hospital billing to review ${questioned.length === 1 ? "it" : "them"}.`);
  if (resolution) parts.push(`${resolution.explanation} The bill changed from ${formatDollars(resolution.originalTotalCents)} to ${formatDollars(resolution.correctedTotalCents)}${resolution.adjustmentCents > 0 ? `, a ${formatDollars(resolution.adjustmentCents)} correction` : ""}.`);
  return parts.join(" ");
}
```

Run the test — Expected: PASS.

- [ ] **Step 14: Run the whole suite and typecheck**

Run: `npm test && npx tsc --noEmit -p spacetimedb` — Expected: all old tests plus the new logic tests pass; no type errors.

- [ ] **Step 15: Commit**

```bash
git add .gitignore tsconfig.json spacetimedb/package.json spacetimedb/package-lock.json spacetimedb/tsconfig.json spacetimedb/src/logic
git commit -m "feat: add cents-based billing logic for the SpacetimeDB module"
```

---

### Task 2: Module schema, reducers, scheduled delivery, and views

**Files:**
- Create: `spacetimedb/src/schema.ts`, `spacetimedb/src/index.ts`, `spacetime.json`, `spacetime.local.json` is NOT committed (add to `.gitignore`)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces (names the client and smoke script rely on):
  - Reducers (export names = reducer names): `scan_demo_payment()`, `investigate_case(caseId: u64)`, `authorize_review(caseId: u64)`, `reset_demo()`, scheduled `deliver_bill`.
  - Views: `my_cases`, `my_medical_records`, `my_bill_items`, `my_findings`, `my_timeline`, `my_audit_log`, `my_communications`.
  - Row fields (camelCase on the client): `bill_case { id, owner, label, status, transactionId, merchant, amountCents, paidOn, invoiceId?, billTotalCents?, resolution?, summary?, createdAt, updatedAt }`; children all carry `id, caseId, owner`; `medical_record { kind, description, date, provider }`; `bill_item { description, code?, amountCents, serviceDate }`; `finding { billItemId?, description, amountCents, clinicalStatus, pricingStatus, confidence, evidence, explanation, action }`; `timeline_event { at, title, detail, source, status }`; `audit_entry { at, action, tool, inputSummary, outputSummary, status }`; `communication { kind, at, status, transcript, result? }`.

**Decision recorded here (spec rule 4 fallback):** status-like columns are `t.string()`, not `t.enum`. 2.10 enums are tagged unions (`{ tag: "DETECTED" }`), which would force tag unwrapping throughout the ported UI. Type safety is kept by writing statuses only through the `CaseStatus`/`ClinicalStatus` unions in module code and casting once in the client assembler. Note this in CLAUDE.md in Task 4.

- [ ] **Step 1: Write `schema.ts`**

```ts
import { schema, table, t } from "spacetimedb/server";

const Resolution = t.object("Resolution", { result: t.string(), originalTotalCents: t.i64(), correctedTotalCents: t.i64(), adjustmentCents: t.i64(), explanation: t.string() });
const child = { id: t.u64().primaryKey().autoInc(), caseId: t.u64().index("btree"), owner: t.identity().index("btree") };

// Every table is private; clients read only through the per-owner views in index.ts.
export const billCase = table({ name: "bill_case" }, {
  id: t.u64().primaryKey().autoInc(), owner: t.identity().index("btree"), label: t.string(), status: t.string(),
  transactionId: t.string(), merchant: t.string(), amountCents: t.i64(), paidOn: t.string(),
  invoiceId: t.option(t.string()), billTotalCents: t.option(t.i64()), resolution: t.option(Resolution), summary: t.option(t.string()),
  createdAt: t.timestamp(), updatedAt: t.timestamp()
});
export const medicalRecord = table({ name: "medical_record" }, { ...child, kind: t.string(), description: t.string(), date: t.string(), provider: t.string() });
export const billItem = table({ name: "bill_item" }, { ...child, description: t.string(), code: t.option(t.string()), amountCents: t.i64(), serviceDate: t.string() });
export const finding = table({ name: "finding" }, { ...child, billItemId: t.option(t.u64()), description: t.string(), amountCents: t.i64(), clinicalStatus: t.string(), pricingStatus: t.string(), confidence: t.f64(), evidence: t.array(t.string()), explanation: t.string(), action: t.string() });
export const timelineEvent = table({ name: "timeline_event" }, { ...child, at: t.timestamp(), title: t.string(), detail: t.string(), source: t.string(), status: t.string() });
export const auditEntry = table({ name: "audit_entry" }, { ...child, at: t.timestamp(), action: t.string(), tool: t.string(), inputSummary: t.string(), outputSummary: t.string(), status: t.string() });
export const communication = table({ name: "communication" }, { ...child, kind: t.string(), at: t.timestamp(), status: t.string(), transcript: t.string(), result: t.option(t.string()) });
export const billDelivery = table({ name: "bill_delivery" }, { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), caseId: t.u64().index("btree") });

const spacetimedb = schema({ billCase, medicalRecord, billItem, finding, timelineEvent, auditEntry, communication, billDelivery });
export default spacetimedb;
```

If `npx tsc --noEmit -p spacetimedb` rejects spreading the shared `child` builders into several tables (builders can be stateful), replace `...child` with the three column definitions written out in each table.

- [ ] **Step 2: Write `index.ts` — helpers**

```ts
import { ScheduleAt } from "spacetimedb";
import { SenderError, t, type InferSchema, type ReducerCtx } from "spacetimedb/server";
import spacetimedb, { auditEntry, billCase, billDelivery, billItem, communication, finding, medicalRecord, timelineEvent } from "./schema";
import { BILL_DELAY_MICROS, DEMO_CASE_LABEL, DEMO_RECORDS, DEMO_STATEMENT, DEMO_TRANSACTION, billRequestTranscript, billingReview, notificationTranscript } from "./logic/fixtures";
import { matchEncounter } from "./logic/matcher";
import { parseItemizedBill } from "./logic/parse-bill";
import { reconcile } from "./logic/reconcile";
import { buildSummary } from "./logic/summary";
import { formatDollars } from "./logic/money";
import type { CaseStatus, ResolutionInput } from "./logic/types";

export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type CaseRow = NonNullable<ReturnType<Ctx["db"]["billCase"]["id"]["find"]>>;
type Step = { action: string; tool: string; input: string; output: string; title: string; detail: string; source: string };

/** Loads a case and rejects callers who do not own it. */
function ownedCase(ctx: Ctx, caseId: bigint): CaseRow {
  const row = ctx.db.billCase.id.find(caseId);
  if (!row || !row.owner.equals(ctx.sender)) throw new SenderError("Case not found");
  return row;
}

/** Writes the status change and stamps updatedAt in one place. */
function setStatus(ctx: Ctx, row: CaseRow, status: CaseStatus, changes: Partial<CaseRow> = {}): CaseRow {
  const next = { ...row, ...changes, status, updatedAt: ctx.timestamp };
  ctx.db.billCase.id.update(next);
  return next;
}

/** Records one controlled tool step in both the audit log and the patient-facing timeline. */
function logStep(ctx: Ctx, row: CaseRow, step: Step) {
  const base = { id: 0n, caseId: row.id, owner: row.owner, at: ctx.timestamp };
  ctx.db.auditEntry.insert({ ...base, action: step.action, tool: step.tool, inputSummary: step.input, outputSummary: step.output, status: "SUCCESS" });
  ctx.db.timelineEvent.insert({ ...base, title: step.title, detail: step.detail, source: step.source, status: "complete" });
}

/** Resolved → summary → in-app notification → USER_NOTIFIED. */
function finishCase(ctx: Ctx, row: CaseRow) {
  const resolved = setStatus(ctx, row, "RESOLVED");
  const findings = [...ctx.db.finding.caseId.filter(row.id)];
  const summary = buildSummary({
    provider: row.merchant,
    supported: findings.filter((item) => item.clinicalStatus === "SUPPORTED").length,
    questioned: findings.filter((item) => item.action === "REQUEST_REVIEW").map((item) => ({ description: item.description, amountCents: Number(item.amountCents) })),
    resolution: resolved.resolution ? { ...resolved.resolution, result: resolved.resolution.result as ResolutionInput["result"], originalTotalCents: Number(resolved.resolution.originalTotalCents), correctedTotalCents: Number(resolved.resolution.correctedTotalCents), adjustmentCents: Number(resolved.resolution.adjustmentCents) } : null
  });
  const withSummary = setStatus(ctx, resolved, "RESOLVED", { summary });
  logStep(ctx, withSummary, { action: "GENERATE_SUMMARY", tool: "buildSummary", input: "Structured case facts", output: "Deterministic summary", title: "Plain-language summary prepared", detail: "Case outcome explained from verified facts", source: "Case agent" });
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "USER_NOTIFICATION", at: ctx.timestamp, status: "COMPLETED", transcript: notificationTranscript, result: summary });
  logStep(ctx, withSummary, { action: "NOTIFY_USER", tool: "notifyUser", input: row.label, output: "In-app summary recorded", title: "You were notified", detail: "Review summary added to your case", source: "Notification" });
  setStatus(ctx, withSummary, "USER_NOTIFIED");
}
```

- [ ] **Step 3: Add the reducers to `index.ts`**

```ts
/** Opens the caller's demo case once; repeated scans are no-ops. */
export const scan_demo_payment = spacetimedb.reducer((ctx) => {
  if ([...ctx.db.billCase.owner.filter(ctx.sender)].some((row) => row.transactionId === DEMO_TRANSACTION.id)) return;
  const row = ctx.db.billCase.insert({
    id: 0n, owner: ctx.sender, label: DEMO_CASE_LABEL, status: "DETECTED", transactionId: DEMO_TRANSACTION.id, merchant: DEMO_TRANSACTION.merchant,
    amountCents: BigInt(DEMO_TRANSACTION.amountCents), paidOn: DEMO_TRANSACTION.date, invoiceId: undefined, billTotalCents: undefined, resolution: undefined, summary: undefined,
    createdAt: ctx.timestamp, updatedAt: ctx.timestamp
  });
  logStep(ctx, row, { action: "CREATE_CASE", tool: "getTransaction", input: DEMO_TRANSACTION.id, output: "Case opened", title: "Hospital payment detected", detail: `${formatDollars(DEMO_TRANSACTION.amountCents)} payment to ${row.merchant}`, source: "Bank transaction" });
});

/** Retrieves records, requests the bill, and schedules the mock statement's arrival. */
export const investigate_case = spacetimedb.reducer({ caseId: t.u64() }, (ctx, { caseId }) => {
  const row = ownedCase(ctx, caseId);
  if (row.status !== "DETECTED") return;
  for (const record of DEMO_RECORDS) ctx.db.medicalRecord.insert({ id: 0n, caseId: row.id, owner: row.owner, ...record });
  logStep(ctx, row, { action: "FETCH_RECORDS", tool: "getMedicalRecords", input: row.paidOn, output: `${DEMO_RECORDS.length} records`, title: "Medical records retrieved", detail: `${DEMO_RECORDS.length} relevant records found near the payment date`, source: "Medical record" });
  const encounter = matchEncounter({ merchant: row.merchant, date: row.paidOn }, DEMO_RECORDS);
  if (encounter) logStep(ctx, row, { action: "MATCH_ENCOUNTER", tool: "matchEncounter", input: row.merchant, output: encounter.description, title: "Medical encounter located", detail: `${encounter.description} · ${encounter.date}`, source: "Medical record" });
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "ITEMIZED_BILL_REQUEST", at: ctx.timestamp, status: "PENDING", transcript: billRequestTranscript(row.merchant), result: "Awaiting itemized statement" });
  logStep(ctx, row, { action: "REQUEST_BILL", tool: "requestItemizedBill", input: row.merchant, output: "Bill request submitted", title: "Itemized bill requested", detail: "Waiting for the provider's statement", source: "Hospital billing" });
  ctx.db.billDelivery.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + BILL_DELAY_MICROS), caseId: row.id });
  setStatus(ctx, row, "WAITING_FOR_BILL");
});

/** Scheduler-only: delivers the statement, parses it, and reconciles each charge. */
export const deliver_bill = spacetimedb.reducer({ onSchedule: billDelivery }, { delivery: billDelivery.rowType }, (ctx, { delivery }) => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError("deliver_bill can only be run by the scheduler");
  const row = ctx.db.billCase.id.find(delivery.caseId);
  if (!row || row.status !== "WAITING_FOR_BILL") return;
  const bill = parseItemizedBill(DEMO_STATEMENT);
  const itemIds = bill.items.map((item) => ctx.db.billItem.insert({ id: 0n, caseId: row.id, owner: row.owner, description: item.description, code: item.code, amountCents: BigInt(item.amountCents), serviceDate: item.serviceDate }).id);
  for (const request of ctx.db.communication.caseId.filter(row.id)) if (request.kind === "ITEMIZED_BILL_REQUEST") ctx.db.communication.id.update({ ...request, status: "COMPLETED", result: `Invoice ${bill.invoiceId} received` });
  const withBill = setStatus(ctx, row, "ANALYZING", { invoiceId: bill.invoiceId, billTotalCents: BigInt(bill.totalCents) });
  logStep(ctx, withBill, { action: "RECEIVE_BILL", tool: "getItemizedBill", input: row.label, output: bill.invoiceId, title: "Itemized bill received", detail: `Statement for invoice ${bill.invoiceId}`, source: "Hospital billing" });
  logStep(ctx, withBill, { action: "PARSE_BILL", tool: "parseItemizedBill", input: bill.invoiceId, output: `${bill.items.length} charges`, title: "Itemized bill parsed", detail: `${bill.items.length} charges extracted from the provider statement`, source: "Case agent" });
  const records = [...ctx.db.medicalRecord.caseId.filter(row.id)].map((record) => ({ ...record, kind: record.kind as (typeof DEMO_RECORDS)[number]["kind"] }));
  const results = reconcile(bill, records);
  for (const item of results) ctx.db.finding.insert({ id: 0n, caseId: row.id, owner: row.owner, billItemId: item.lineIndex === null ? undefined : itemIds[item.lineIndex], description: item.description, amountCents: BigInt(item.amountCents), clinicalStatus: item.clinicalStatus, pricingStatus: item.pricingStatus, confidence: item.confidence, evidence: item.evidence, explanation: item.explanation, action: item.action });
  const supported = results.filter((item) => item.clinicalStatus === "SUPPORTED").length;
  const review = results.filter((item) => item.action === "REQUEST_REVIEW").length;
  logStep(ctx, withBill, { action: "RECONCILE", tool: "compareBillToRecords", input: `${bill.items.length} charges`, output: `${supported} supported, ${review} need review`, title: "Bill analyzed", detail: `${supported} supported · ${review} requires review`, source: "Reconciliation engine" });
  if (!review) return finishCase(ctx, withBill);
  ctx.db.timelineEvent.insert({ id: 0n, caseId: row.id, owner: row.owner, at: ctx.timestamp, title: "Your approval is needed", detail: "Review the uncertain charge before contacting hospital billing", source: "You", status: "attention" });
  setStatus(ctx, withBill, "REVIEW_REQUIRED");
});

/** The only path to provider contact: the case owner explicitly authorizes billing review. */
export const authorize_review = spacetimedb.reducer({ caseId: t.u64() }, (ctx, { caseId }) => {
  const row = ownedCase(ctx, caseId);
  if (row.status !== "REVIEW_REQUIRED" || !row.invoiceId) throw new SenderError("Case is not ready for billing review");
  for (const event of ctx.db.timelineEvent.caseId.filter(row.id)) if (event.status === "attention") ctx.db.timelineEvent.id.update({ ...event, status: "complete", title: "You authorized billing review", detail: "Hospital billing may now verify the questioned charge" });
  const questioned = [...ctx.db.finding.caseId.filter(row.id)].filter((item) => item.action === "REQUEST_REVIEW");
  const { transcript, resolution } = billingReview(row.merchant, row.invoiceId, questioned[0]?.description ?? "questioned");
  ctx.db.communication.insert({ id: 0n, caseId: row.id, owner: row.owner, kind: "BILLING_REVIEW", at: ctx.timestamp, status: "COMPLETED", transcript, result: resolution.explanation });
  const resolved = setStatus(ctx, row, "CONTACTING_PROVIDER", { resolution: { result: resolution.result, originalTotalCents: BigInt(resolution.originalTotalCents), correctedTotalCents: BigInt(resolution.correctedTotalCents), adjustmentCents: BigInt(resolution.adjustmentCents), explanation: resolution.explanation } });
  logStep(ctx, resolved, { action: "REQUEST_REVIEW", tool: "requestBillingReview", input: `${questioned.length} findings`, output: resolution.result, title: "Hospital billing responded", detail: resolution.explanation, source: "Hospital billing" });
  finishCase(ctx, resolved);
});

/** Deletes every row the caller owns, including a pending bill delivery. */
export const reset_demo = spacetimedb.reducer((ctx) => {
  for (const row of [...ctx.db.billCase.owner.filter(ctx.sender)]) {
    for (const delivery of [...ctx.db.billDelivery.caseId.filter(row.id)]) ctx.db.billDelivery.scheduledId.delete(delivery.scheduledId);
    ctx.db.billCase.id.delete(row.id);
  }
  for (const item of [...ctx.db.medicalRecord.owner.filter(ctx.sender)]) ctx.db.medicalRecord.id.delete(item.id);
  for (const item of [...ctx.db.billItem.owner.filter(ctx.sender)]) ctx.db.billItem.id.delete(item.id);
  for (const item of [...ctx.db.finding.owner.filter(ctx.sender)]) ctx.db.finding.id.delete(item.id);
  for (const item of [...ctx.db.timelineEvent.owner.filter(ctx.sender)]) ctx.db.timelineEvent.id.delete(item.id);
  for (const item of [...ctx.db.auditEntry.owner.filter(ctx.sender)]) ctx.db.auditEntry.id.delete(item.id);
  for (const item of [...ctx.db.communication.owner.filter(ctx.sender)]) ctx.db.communication.id.delete(item.id);
});
```

- [ ] **Step 4: Add the per-owner views to `index.ts`**

```ts
// Public, per-caller views are the only way clients read data; every table above is private.
export const my_cases = spacetimedb.view({ name: "my_cases", public: true }, t.array(billCase.rowType), (ctx) => [...ctx.db.billCase.owner.filter(ctx.sender)]);
export const my_medical_records = spacetimedb.view({ name: "my_medical_records", public: true }, t.array(medicalRecord.rowType), (ctx) => [...ctx.db.medicalRecord.owner.filter(ctx.sender)]);
export const my_bill_items = spacetimedb.view({ name: "my_bill_items", public: true }, t.array(billItem.rowType), (ctx) => [...ctx.db.billItem.owner.filter(ctx.sender)]);
export const my_findings = spacetimedb.view({ name: "my_findings", public: true }, t.array(finding.rowType), (ctx) => [...ctx.db.finding.owner.filter(ctx.sender)]);
export const my_timeline = spacetimedb.view({ name: "my_timeline", public: true }, t.array(timelineEvent.rowType), (ctx) => [...ctx.db.timelineEvent.owner.filter(ctx.sender)]);
export const my_audit_log = spacetimedb.view({ name: "my_audit_log", public: true }, t.array(auditEntry.rowType), (ctx) => [...ctx.db.auditEntry.owner.filter(ctx.sender)]);
export const my_communications = spacetimedb.view({ name: "my_communications", public: true }, t.array(communication.rowType), (ctx) => [...ctx.db.communication.owner.filter(ctx.sender)]);
```

- [ ] **Step 5: Typecheck and build the module**

Run: `npx tsc --noEmit -p spacetimedb` — Expected: no errors. If `ctx.databaseIdentity` is not a property in 2.10.2, use `ctx.identity` (check `spacetimedb/node_modules/spacetimedb/dist/server/*.d.ts` with `grep -rn "databaseIdentity\|identity()" spacetimedb/node_modules/spacetimedb/dist --include=*.d.ts | head`) and keep `.equals`, never `!==`, for `Identity` comparison.

Create `spacetime.json`:
```json
{ "module-path": "./spacetimedb", "server": "maincloud" }
```
Append `spacetime.local.json` to `.gitignore` (it holds the per-checkout database name).

Run: `spacetime build --module-path spacetimedb` — Expected: build succeeds. Any runtime-forbidden API (Intl, Date.now) shows up later in the smoke test as a reducer error, not here.

- [ ] **Step 6: Commit**

```bash
git add .gitignore spacetime.json spacetimedb/src/schema.ts spacetimedb/src/index.ts
git commit -m "feat: add SpacetimeDB module with case state machine and per-owner views"
```

---

### Task 3: End-to-end smoke test against a local server

**Files:**
- Create: `scripts/smoke.sh`
- Modify: `package.json` — add `"smoke": "bash scripts/smoke.sh"`

**Interfaces:**
- Consumes: reducer and view names from Task 2. CLI: `spacetime call -s local <db> <reducer> [args]`, `spacetime sql -s local <db> "<query>"`, `--anonymous` for a second identity.

- [ ] **Step 1: Write `scripts/smoke.sh`**

```bash
#!/usr/bin/env bash
# Runs the University Hospital story against a throwaway local SpacetimeDB server.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
DB="mbg-smoke"
DATA_DIR="$(mktemp -d)"
spacetime start --data-dir "$DATA_DIR" >"$DATA_DIR/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; rm -rf "$DATA_DIR"' EXIT
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:3000/v1/ping >/dev/null 2>&1 && break; sleep 0.5; done

call() { spacetime call -y -s local "$DB" "$@"; }
sql() { spacetime sql -y -s local "$DB" "$1"; }
fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }

spacetime publish -y -s local --module-path spacetimedb "$DB" >/dev/null

call scan_demo_payment
call scan_demo_payment   # second scan must not create a second case
[ "$(sql "SELECT id FROM bill_case" | grep -cE '^\s*[0-9]+\s*$')" = "1" ] || fail "repeated scan created a duplicate case"

call investigate_case 1
call investigate_case 1  # second click is a no-op, not an error
sql "SELECT status FROM bill_case" | grep -q WAITING_FOR_BILL || fail "case did not wait for the bill"

spacetime call -y -s local --anonymous "$DB" authorize_review 1 2>/dev/null && fail "a stranger authorized review"
spacetime sql -y -s local --anonymous "$DB" "SELECT * FROM bill_case" 2>/dev/null | grep -q CASE-4821 && fail "private table visible to a stranger"

sleep 3
sql "SELECT status FROM bill_case" | grep -q REVIEW_REQUIRED || fail "bill was not delivered and analyzed"
[ "$(sql "SELECT id FROM bill_item" | grep -cE '^\s*[0-9]+\s*$')" = "6" ] || fail "expected six bill items"

call authorize_review 1
sql "SELECT status FROM bill_case" | grep -q USER_NOTIFIED || fail "case did not finish"
sql "SELECT resolution FROM bill_case" | grep -q 412000 || fail "corrected total is not 412000 cents"

# Restart while a bill is pending: the scheduled delivery must be removed with the case.
call reset_demo
call scan_demo_payment
call investigate_case 2
call reset_demo
sleep 3
[ "$(sql "SELECT id FROM bill_item" | grep -cE '^\s*[0-9]+\s*$')" = "0" ] || fail "a pending bill landed after reset"

echo "SMOKE PASS"
```

Run: `chmod +x scripts/smoke.sh`

- [ ] **Step 2: Add the script entry**

In `package.json` `"scripts"`, add `"smoke": "bash scripts/smoke.sh"`.

- [ ] **Step 3: Run it**

Run: `npm run smoke` — Expected: last line `SMOKE PASS`.

Known adjustments if it fails for tooling reasons (not logic):
- If `curl .../v1/ping` never succeeds, replace the wait loop with `sleep 3`.
- If `spacetime sql` output wraps values differently, inspect with `spacetime sql -s local mbg-smoke "SELECT id, status FROM bill_case"` while the server runs and adjust only the `grep` patterns.
- If the second case id is not `2` after reset (auto-increment continues), read it with `sql "SELECT id FROM bill_case"` and pass that value.
- If publishing to `local` asks for login, run `spacetime login` once and re-run.

A failure on a logic assertion is a bug in Task 2: fix the reducer, not the assertion.

- [ ] **Step 4: Verify the scheduler-only guard by hand**

While the smoke server is running in another terminal (`spacetime start`), publish and try to call the scheduled reducer as a client:
```bash
spacetime publish -y -s local --module-path spacetimedb mbg-guard
spacetime call -y -s local mbg-guard deliver_bill '{"scheduledId":1,"scheduledAt":{"Time":0},"caseId":1}'
```
Expected: the call fails with "deliver_bill can only be run by the scheduler" (or the CLI rejects the argument encoding; either way no bill is delivered). Record which one happened in the commit message.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke.sh package.json
git commit -m "test: add end-to-end SpacetimeDB smoke script"
```

---

### Task 4: Vite client replaces Next.js

**Files:**
- Create: `index.html`, `vite.config.ts`, `src/vite-env.d.ts`, `src/main.tsx`, `src/App.tsx`, `src/lib/assemble.ts`, `src/lib/assemble.test.ts`, `src/module_bindings/` (generated)
- Move: `src/app/globals.css` → `src/styles.css`
- Modify: `src/components/Dashboard.tsx`, `src/components/CaseView.tsx`, `src/components/CaseActivity.tsx`, `package.json`, `tsconfig.json`, `.env.example`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `PROJECT_CHECKLIST.md`
- Delete: the files listed under "Deleted in Task 4" above

**Interfaces:**
- Consumes: generated bindings `tables.myCases`, `tables.myMedicalRecords`, `tables.myBillItems`, `tables.myFindings`, `tables.myTimeline`, `tables.myAuditLog`, `tables.myCommunications`; `reducers.scanDemoPayment`, `reducers.investigateCase`, `reducers.authorizeReview`, `reducers.resetDemo` (confirm exact names in `src/module_bindings/index.ts` after generation).
- Produces: `assembleCases(rows: ViewRows): MedicalBillCase[]` in `src/lib/assemble.ts`; components take `MedicalBillCase` plus callbacks.

- [ ] **Step 1: Swap dependencies and scripts**

Run:
```bash
npm uninstall next
npm install --save-exact spacetimedb@2.10.2
npm install --save-exact --save-dev vite@8.3.2 @vitejs/plugin-react@6.1.1 wrangler@4.147.0
```
Set `package.json` `"scripts"` to:
```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "smoke": "bash scripts/smoke.sh",
  "spacetime:generate": "spacetime generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb",
  "deploy": "npm run build && wrangler deploy"
}
```
If `npm install` reports a peer conflict between `@vitejs/plugin-react@6.1.1` and `vite@8.3.2`, stop and report the message; do not use `--force`.

- [ ] **Step 2: Vite entry files**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="A clearer view of every hospital charge." />
    <title>Medical Bill Guardian</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()], test: { exclude: ["node_modules", "spacetimedb/node_modules", "dist"] } });
```
If `test` is not accepted by Vite's config type, add `/// <reference types="vitest/config" />` as the first line.

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_SPACETIMEDB_HOST?: string; readonly VITE_SPACETIMEDB_DB_NAME?: string }
```

Root `tsconfig.json`: remove the `"plugins"` (Next) entry and `"incremental"`, remove `next-env.d.ts`/`.next` from `include`, add `"types": ["vite/client"]` to `compilerOptions`.

- [ ] **Step 3: Generate bindings against a local server**

In a second terminal: `spacetime start`. Then:
```bash
spacetime publish -y -s local --module-path spacetimedb medical-bill-guardian
npm run spacetime:generate
grep -nE "myCases|scanDemoPayment|investigateCase|authorizeReview|resetDemo" src/module_bindings/index.ts
```
Expected: all five names found. If the generator names views differently (e.g. `my_cases`), use the generated names in Steps 5–6.

- [ ] **Step 4: Write the failing assembler test** — `src/lib/assemble.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { Identity, Timestamp } from "spacetimedb";
import { assembleCases, type ViewRows } from "./assemble";

const owner = Identity.zero();
const at = (micros: bigint) => new Timestamp(micros);

const rows: ViewRows = {
  cases: [{ id: 7n, owner, label: "CASE-4821", status: "USER_NOTIFIED", transactionId: "nessie-demo-4820", merchant: "University Hospital", amountCents: 482000n, paidOn: "2026-09-28", invoiceId: "UH-48291", billTotalCents: 482000n, resolution: { result: "DUPLICATE_REMOVED", originalTotalCents: 482000n, correctedTotalCents: 412000n, adjustmentCents: 70000n, explanation: "Removed." }, summary: "Done.", createdAt: at(1n), updatedAt: at(9n) }],
  records: [],
  billItems: [{ id: 3n, caseId: 7n, owner, description: "Specialist consultation", code: undefined, amountCents: 70000n, serviceDate: "2026-09-28" }],
  findings: [{ id: 4n, caseId: 7n, owner, billItemId: 3n, description: "Specialist consultation", amountCents: 70000n, clinicalStatus: "NO_MATCH_FOUND", pricingStatus: "NOT_ASSESSED", confidence: 0.35, evidence: [], explanation: "No match.", action: "REQUEST_REVIEW" }],
  timeline: [
    { id: 2n, caseId: 7n, owner, at: at(5n), title: "Second", detail: "", source: "", status: "complete" },
    { id: 1n, caseId: 7n, owner, at: at(5n), title: "First", detail: "", source: "", status: "complete" }
  ],
  audit: [],
  communications: []
};

describe("assembleCases", () => {
  it("rebuilds the display case in dollars with string ids", () => {
    const [item] = assembleCases(rows);
    expect(item.id).toBe("7");
    expect(item.transaction.amount).toBe(4820);
    expect(item.bill?.total).toBe(4820);
    expect(item.bill?.items[0]).toMatchObject({ id: "3", amount: 700 });
    expect(item.findings[0]).toMatchObject({ billItemId: "3", amount: 700, action: "REQUEST_REVIEW" });
    expect(item.resolution).toMatchObject({ originalTotal: 4820, correctedTotal: 4120, adjustment: 700 });
  });

  it("orders timeline events by insertion id when timestamps tie", () => {
    expect(assembleCases(rows)[0].timeline.map((event) => event.title)).toEqual(["First", "Second"]);
  });

  it("returns no bill until the statement has been delivered", () => {
    const pending = { ...rows, cases: [{ ...rows.cases[0], invoiceId: undefined, billTotalCents: undefined }], billItems: [] };
    expect(assembleCases(pending)[0].bill).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/assemble.test.ts` — Expected: FAIL, cannot resolve `./assemble`.

- [ ] **Step 5: Implement `src/lib/assemble.ts`**

```ts
import type { Timestamp } from "spacetimedb";
import type * as Row from "../module_bindings/types";
import type { AuditEntry, CaseStatus, ClinicalStatus, Communication, MedicalBillCase, MedicalRecord, Resolution, TimelineEvent } from "../types/domain";

export type ViewRows = { cases: readonly Row.BillCase[]; records: readonly Row.MedicalRecord[]; billItems: readonly Row.BillItem[]; findings: readonly Row.Finding[]; timeline: readonly Row.TimelineEvent[]; audit: readonly Row.AuditEntry[]; communications: readonly Row.Communication[] };

const dollars = (cents: bigint) => Number(cents) / 100;
const iso = (at: Timestamp) => new Date(Number(at.microsSinceUnixEpoch / 1000n)).toISOString();
// Rows written in one transaction share a timestamp; the auto-increment id preserves their order.
const byInsertion = <T extends { id: bigint }>(rows: readonly T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Reassembles view rows into the display shape the components already use. Status strings are written only from typed unions in the module. */
export function assembleCases(rows: ViewRows): MedicalBillCase[] {
  return byInsertion(rows.cases).map((row) => {
    const mine = <T extends { caseId: bigint; id: bigint }>(list: readonly T[]) => byInsertion(list.filter((item) => item.caseId === row.id));
    const resolution: Resolution | null = row.resolution ? { result: row.resolution.result as Resolution["result"], originalTotal: dollars(row.resolution.originalTotalCents), correctedTotal: dollars(row.resolution.correctedTotalCents), adjustment: dollars(row.resolution.adjustmentCents), explanation: row.resolution.explanation } : null;
    return {
      id: row.id.toString(), label: row.label, status: row.status as CaseStatus,
      transaction: { id: row.transactionId, merchant: row.merchant, amount: dollars(row.amountCents), date: row.paidOn },
      provider: { name: row.merchant },
      medicalRecords: mine(rows.records).map((item): MedicalRecord => ({ id: item.id.toString(), type: item.kind as MedicalRecord["type"], description: item.description, date: item.date, provider: item.provider })),
      bill: row.invoiceId && row.billTotalCents !== undefined ? { invoiceId: row.invoiceId, provider: row.merchant, total: dollars(row.billTotalCents), items: mine(rows.billItems).map((item) => ({ id: item.id.toString(), description: item.description, code: item.code, amount: dollars(item.amountCents), serviceDate: item.serviceDate })) } : null,
      findings: mine(rows.findings).map((item) => ({ billItemId: item.billItemId?.toString() ?? "bill-total", description: item.description, amount: dollars(item.amountCents), clinicalStatus: item.clinicalStatus as ClinicalStatus, pricingStatus: item.pricingStatus as "NOT_ASSESSED" | "REVIEW", confidence: item.confidence, evidence: [...item.evidence], explanation: item.explanation, action: item.action as "NONE" | "REQUEST_REVIEW" })),
      communications: mine(rows.communications).map((item): Communication => ({ id: item.id.toString(), type: item.kind as Communication["type"], timestamp: iso(item.at), status: item.status as Communication["status"], transcript: item.transcript, result: item.result })),
      timeline: mine(rows.timeline).map((item): TimelineEvent => ({ id: item.id.toString(), timestamp: iso(item.at), title: item.title, detail: item.detail, source: item.source, status: item.status as TimelineEvent["status"] })),
      auditLog: mine(rows.audit).map((item): AuditEntry => ({ id: item.id.toString(), timestamp: iso(item.at), action: item.action, tool: item.tool, inputSummary: item.inputSummary, outputSummary: item.outputSummary, status: item.status as AuditEntry["status"] })),
      resolution, summary: row.summary ?? null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt)
    };
  });
}
```

Modify `src/types/domain.ts`: add `label: string` to `MedicalBillCase` (display name "CASE-4821"; `id` is now the numeric row id as a string). Check the generated type names in `src/module_bindings/types.ts` (`BillCase`, `MedicalRecord`, …) and adjust the `Row.*` names if the generator differs. If view rows are generated as separate types (e.g. `MyCases`), use those.

Run: `npx vitest run src/lib/assemble.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 6: `src/main.tsx` and `src/App.tsx`**

`src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings";
import { App } from "./App";
import "./styles.css";

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? "ws://localhost:3000";
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "medical-bill-guardian";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

// Storage can be blocked (private windows); the demo still works, the identity just does not survive a reload.
const readToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; } };
const saveToken = (token: string) => { try { localStorage.setItem(TOKEN_KEY, token); } catch { /* identity is per-session */ } };

const root = createRoot(document.getElementById("root")!);
// A failed connection would otherwise leave "Connecting…" on screen forever.
const connectionBuilder = DbConnection.builder().withUri(HOST).withDatabaseName(DB_NAME).withToken(readToken())
  .onConnect((_conn, _identity, token) => saveToken(token))
  .onConnectError((_ctx, error) => { console.error(error); root.render(<main className="loading-state">Could not reach the demo server. Refresh to try again.</main>); });

root.render(<StrictMode><SpacetimeDBProvider connectionBuilder={connectionBuilder}><App /></SpacetimeDBProvider></StrictMode>);
```

`src/App.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import { reducers, tables } from "./module_bindings";
import { assembleCases } from "./lib/assemble";
import { Dashboard } from "./components/Dashboard";
import { CaseView } from "./components/CaseView";

export type CaseActions = { investigate: (id: string) => Promise<void>; authorize: (id: string) => Promise<void>; restart: () => Promise<void> };

/** Subscribes to the caller's views and switches between the dashboard and one case. */
export function App() {
  const { isActive } = useSpacetimeDB();
  const [cases] = useTable(tables.myCases);
  const [records] = useTable(tables.myMedicalRecords);
  const [billItems] = useTable(tables.myBillItems);
  const [findings] = useTable(tables.myFindings);
  const [timeline] = useTable(tables.myTimeline);
  const [audit] = useTable(tables.myAuditLog);
  const [communications] = useTable(tables.myCommunications);
  const scan = useReducer(reducers.scanDemoPayment);
  const investigate = useReducer(reducers.investigateCase);
  const authorize = useReducer(reducers.authorizeReview);
  const reset = useReducer(reducers.resetDemo);
  const [openId, setOpenId] = useState<string | null>(null);
  const scanned = useRef(false);

  useEffect(() => { if (isActive && !scanned.current) { scanned.current = true; void scan({}); } }, [isActive, scan]);

  const all = useMemo(() => assembleCases({ cases, records, billItems, findings, timeline, audit, communications }), [cases, records, billItems, findings, timeline, audit, communications]);
  const actions: CaseActions = {
    investigate: (id) => investigate({ caseId: BigInt(id) }),
    authorize: (id) => authorize({ caseId: BigInt(id) }),
    restart: async () => { await reset({}); await scan({}); setOpenId(null); }
  };

  if (!isActive) return <main className="loading-state">Connecting to Medical Bill Guardian…</main>;
  const open = all.find((item) => item.id === openId);
  return open ? <CaseView caseData={open} actions={actions} onBack={() => setOpenId(null)} /> : <Dashboard cases={all} onOpen={setOpenId} onScan={() => scan({})} />;
}
```
If `useReducer(...)` returns a function with a different signature in 2.10.2 (check `node_modules/spacetimedb/dist/react/*.d.ts`), adapt the three calls in `actions` and the `scan` call; keep `Promise<void>` returns so components can catch errors. After a restart, the new case gets a new id, so returning to the dashboard is intentional.

- [ ] **Step 7: Port the components**

Apply these exact changes; keep all markup and class names otherwise unchanged.

`Dashboard.tsx`:
- Remove `"use client"`, `import Link from "next/link"`, `useCallback`, `useEffect`, the `refresh`/`scan` functions and the `fetch` calls, and the `demo` prop.
- New signature: `export function Dashboard({ cases, onOpen, onScan }: { cases: MedicalBillCase[]; onOpen: (id: string) => void; onScan: () => Promise<void> })`.
- Keep `busy`/`error` state; new `scan` handler: `async function scan() { setBusy(true); setError(""); try { await onScan(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Scan failed"); } finally { setBusy(false); } }`.
- Replace both `<Link href="/" className="brand">…</Link>` with `<span className="brand">…</span>`.
- Replace `<Link href={`/cases/${item.id}`} className="case-card" key={item.id}>…</Link>` with `<button type="button" className="case-card" key={item.id} onClick={() => onOpen(item.id)}>…</button>`, and show `{item.label}` where it showed `{item.id}`.
- Always render the demo pill (the app is demo-only).
- Replace `import type { MedicalBillCase } from "@/types/domain"` with a relative import `../types/domain`.

`CaseView.tsx`:
- Remove `"use client"`, `Link`, `useCallback`, `useEffect`, the `load` function, the polling `useEffect` (the scheduled reducer pushes the bill now), `action`, `restartDemo`, and the `demo` prop.
- New signature: `export function CaseView({ caseData, actions, onBack }: { caseData: MedicalBillCase; actions: CaseActions; onBack: () => void })` with `import type { CaseActions } from "../App"`.
- Add one runner: `async function run(task: () => Promise<void>) { setBusy(true); setError(""); try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The action failed"); } finally { setBusy(false); } }`.
- `action("run")` → `run(() => actions.investigate(caseData.id))`; `action("request-review", { authorized: true })` → `run(() => actions.authorize(caseData.id))`; `restartDemo` → `run(actions.restart)`.
- Replace the review-time `setSelected(...)` from the polling effect with: `useEffect(() => { if (caseData.status === "REVIEW_REQUIRED") setSelected(caseData.findings.find((item) => item.action === "REQUEST_REVIEW")?.billItemId ?? null); }, [caseData.status, caseData.findings]);` (import `useEffect`).
- Replace `<Link href="/" className="back-link">…</Link>` with `<button type="button" className="back-link" onClick={onBack}>…</button>`, brand links with `<span className="brand">`, and delete the `if (!caseData)` loading branch.
- Show `{caseData.label}` wherever it showed `{caseData.id}`; always render the demo pill and the restart button.
- Imports from `@/types/domain` become `../types/domain`.

`CaseActivity.tsx`: change `@/types/domain` to `../types/domain`.

Move `src/app/globals.css` to `src/styles.css` with `git mv`. Add to the end of `src/styles.css` so the converted buttons look like the old links:
```css
button.case-card, button.back-link { font: inherit; color: inherit; text-align: inherit; background: none; border: 0; cursor: pointer; width: 100%; }
button.back-link { width: auto; }
```
(If `.case-card` already sets a background or border, remove `background: none; border: 0;` from this rule so the existing card styling wins.)

- [ ] **Step 8: Delete the Next.js and SQLite code**

```bash
git rm -r src/app/api "src/app/cases" src/app/layout.tsx src/app/page.tsx src/lib/db.ts src/lib/db.test.ts src/lib/providers.ts src/proxy.ts src/proxy.test.ts src/services/agent src/services/communications src/services/reconciliation src/services/demo.ts src/services/banking/mock.ts src/services/medical/mock.ts next-env.d.ts
```
Then `grep -rn "next/\|@/\|services/demo\|lib/db\|lib/providers" src` — Expected: no results. Fix any remaining import.

- [ ] **Step 9: Verify**

Run: `npm test && npm run typecheck && npm run build` — Expected: all tests pass (logic, assembler, Nessie, FinchNode); build writes `dist/`.

With `spacetime start` running and the module published locally as `medical-bill-guardian`, run `npm run dev` and open `http://localhost:5173` in the browser preview:
1. The University Hospital case appears without clicking anything.
2. Open it, click **Investigate this bill** — records appear at once; about 2 s later the bill and findings appear with no reload.
3. The $700 specialist line is marked as needing review; click **Authorize billing review** — the summary shows $4,820 → $4,120.
4. **Restart demo** returns to the dashboard with a fresh case.
5. Open a second tab: same case, same state. Open a private window: a separate, fresh case.

- [ ] **Step 10: Update docs**

- `.env.example`: replace `DEMO_MODE` and Next-specific entries with:
  ```
  # SpacetimeDB WebSocket host. Local: ws://localhost:3000. Maincloud: wss://maincloud.spacetimedb.com
  VITE_SPACETIMEDB_HOST=ws://localhost:3000
  # Database name the module was published under (public; compiled into the bundle)
  VITE_SPACETIMEDB_DB_NAME=medical-bill-guardian
  ```
  Keep the Nessie, FinchNode, and Relay entries under a heading comment: "Read only by the unused reference adapters in src/services; the deployed app does not use them." Remove `OPENAI_API_KEY`/`OPENAI_MODEL`.
- `README.md`: rewrite Architecture (diagram from the spec), Quick start (`npm ci`, `npm ci --prefix spacetimedb`, `cp .env.example .env.local`, `spacetime start`, `spacetime publish -s local --module-path spacetimedb medical-bill-guardian`, `npm run spacetime:generate`, `npm run dev` → `http://localhost:5173`), checks (`npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`), and demo safety (module has no network calls; per-owner views; no OpenAI). Remove the API route list.
- `CLAUDE.md`: replace the handoff body with the new layout and the why: logic in `spacetimedb/src/logic` (pure, cents, no Intl/clock), private tables + per-owner views, scheduled `deliver_bill` with its scheduler-only guard, status columns as strings (Task 2 decision), `assembleCases` as the only place rows become display types, commands, ports (SpacetimeDB 3000, Vite 5173).
- `AGENTS.md`: delete the "This is NOT the Next.js you know" block; rewrite the architecture paragraphs to match.
- `PROJECT_CHECKLIST.md`: add a "SpacetimeDB migration" section with completed items; reword items that mention `DEMO_MODE`, SQLite, Next.js route handlers, and the OpenAI summary.

Run: `grep -rn "DEMO_MODE\|next dev\|SQLite\|route handler\|OPENAI" README.md CLAUDE.md AGENTS.md PROJECT_CHECKLIST.md .env.example` — Expected: only mentions that describe the removal or history.

- [ ] **Step 11: Commit**

```bash
git add -A
git status --short   # confirm no .env, .env.local, data/, dist/ entries
git commit -m "feat: replace Next.js with a Vite client on SpacetimeDB views"
```

---

### Task 5: Publish to Maincloud and deploy to Cloudflare

**Files:**
- Create: `wrangler.jsonc`
- Modify: `README.md`, `CLAUDE.md` (deployment section with the real URLs)

**Interfaces:**
- Consumes: the built `dist/` from Task 4 and the module from Task 2.

- [ ] **Step 1: Write `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "medical-bill-guardian",
  "compatibility_date": "2026-10-03",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  },
  "observability": { "enabled": true }
}
```

- [ ] **Step 2: Ask the user before publishing the module**

Ask in chat: "Ready to publish the module to Maincloud as `medical-bill-guardian`. OK?" Wait for yes. Then:
```bash
spacetime publish -y --module-path spacetimedb medical-bill-guardian
```
If the name is taken, ask the user to approve `medical-bill-guardian-<short suffix>` and use that name in every later step. Expected: output names the database and its identity.

- [ ] **Step 3: Build against Maincloud**

Create `.env.production.local` (ignored by the existing `.env.*` rule):
```
VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DB_NAME=medical-bill-guardian
```
Run: `npm run build` — Expected: `dist/` built; `grep -l maincloud dist/assets/*.js` finds the host.

- [ ] **Step 4: Ask the user before deploying**

Ask in chat: "Ready to deploy the frontend to Cloudflare Workers as `medical-bill-guardian`. OK?" Wait for yes. Then: `npx wrangler deploy` — Expected: a `*.workers.dev` URL.

- [ ] **Step 5: Verify the live demo**

Open the deployed URL in the browser preview and repeat Task 4 Step 9's five checks against Maincloud. Then `spacetime logs medical-bill-guardian | tail -20` — Expected: no reducer errors.

- [ ] **Step 6: Document and commit**

Add to README a "Live demo" line with the workers.dev URL and a "Deploy" section (`spacetime publish --module-path spacetimedb <db>`, `npm run deploy`; schema changes that break existing rows need `--delete-data`, acceptable because data is synthetic). Add the same commands and the database name to CLAUDE.md.

```bash
git add wrangler.jsonc README.md CLAUDE.md
git commit -m "chore: deploy module to Maincloud and frontend to Cloudflare"
```
