# Receipt Trace Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic dashboard with a judge-ready Receipt Trace experience that makes the synthetic case workflow, evidence matching, authorization boundary, and provider-confirmed correction immediately understandable.

**Architecture:** Preserve the existing Next.js routes, `MedicalBillCase` model, orchestration, polling, and provider interfaces. Add pure case-presentation helpers and focused React components, then compose them in the existing dashboard and case client components. Story/System view remains local UI state and renders only existing case, timeline, audit, and communication facts.

**Tech Stack:** Next.js 16.3.8 App Router, React 19.1.1, TypeScript 5.9.2, Vitest 4.1.11, CSS, `next/font/google`, Lucide React.

**Spec:** `docs/superpowers/specs/2026-10-03-receipt-trace-demo-design.md`

## Global Constraints

- Keep all current API routes, persisted case fields, orchestrator transitions, and provider boundaries unchanged.
- The active run must be labeled “Synthetic demo”; do not represent Nessie, FinchNode, Relay, Photon, or OpenAI as active unless the returned case data proves that exact activity.
- Missing evidence means “needs review,” never “invalid charge.”
- Show savings only after a provider-confirmed `resolution.adjustment` exists.
- Coral `#FF563F` is reserved for unresolved evidence and consequential actions.
- Use Petrona for display, Albert Sans for interface text, and DM Mono for bill and audit data through Next.js font handling.
- Preserve explicit authorization before provider contact.
- Support visible keyboard focus, reduced motion, and phone/tablet/desktop layouts.
- Do not add dependencies.

---

### Task 1: Add tested presentation mapping

**Files:**
- Create: `src/components/case-presentation.ts`
- Create: `src/components/case-presentation.test.ts`

**Interfaces:**
- Consumes: `CaseStatus`, `MedicalBillCase`, and `Finding` from `src/types/domain.ts`.
- Produces: `getDemoStage(status: CaseStatus): DemoStage`, `getStatusCopy(status: CaseStatus): string`, `getCaseNumbers(caseData: MedicalBillCase): CaseNumbers`, and `getFindingTone(finding?: Finding): "supported" | "attention" | "neutral"`.

- [ ] **Step 1: Write failing mapping tests**

```ts
import { describe, expect, it } from "vitest";
import { createCase } from "@/services/agent/orchestrator";
import { demoTransaction } from "@/services/demo";
import { getCaseNumbers, getDemoStage, getFindingTone, getStatusCopy } from "./case-presentation";

describe("case presentation", () => {
  it("maps orchestration statuses to the four demo stages", () => {
    expect(getDemoStage("DETECTED")).toBe("detect");
    expect(getDemoStage("WAITING_FOR_BILL")).toBe("retrieve");
    expect(getDemoStage("ANALYZING")).toBe("reconcile");
    expect(getDemoStage("REVIEW_REQUIRED")).toBe("decide");
    expect(getDemoStage("USER_NOTIFIED")).toBe("complete");
  });

  it("uses cautious, user-facing status language", () => {
    expect(getStatusCopy("REVIEW_REQUIRED")).toBe("Your decision is needed");
    expect(getStatusCopy("FAILED")).toBe("Investigation needs attention");
  });

  it("does not invent savings before provider confirmation", () => {
    const caseData = createCase(demoTransaction);
    expect(getCaseNumbers(caseData)).toEqual({ original: 4820, corrected: null, adjustment: 0 });
  });

  it("keeps missing evidence distinct from supported evidence", () => {
    expect(getFindingTone()).toBe("neutral");
    expect(getFindingTone({ action: "REQUEST_REVIEW" } as never)).toBe("attention");
    expect(getFindingTone({ action: "NONE", clinicalStatus: "SUPPORTED" } as never)).toBe("supported");
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/components/case-presentation.test.ts`

Expected: FAIL because `./case-presentation` does not exist.

- [ ] **Step 3: Implement the presentation helpers**

```ts
import type { CaseStatus, Finding, MedicalBillCase } from "@/types/domain";

export type DemoStage = "detect" | "retrieve" | "reconcile" | "decide" | "complete";
export type CaseNumbers = { original: number; corrected: number | null; adjustment: number };

export function getDemoStage(status: CaseStatus): DemoStage {
  if (status === "DETECTED") return "detect";
  if (["FETCHING_RECORDS", "REQUESTING_BILL", "WAITING_FOR_BILL"].includes(status)) return "retrieve";
  if (status === "ANALYZING") return "reconcile";
  if (["REVIEW_REQUIRED", "CONTACTING_PROVIDER", "WAITING_FOR_PROVIDER"].includes(status)) return "decide";
  return "complete";
}

export function getStatusCopy(status: CaseStatus) {
  const copy: Record<CaseStatus, string> = {
    DETECTED: "Payment ready to trace",
    FETCHING_RECORDS: "Retrieving medical records",
    REQUESTING_BILL: "Requesting the itemized statement",
    WAITING_FOR_BILL: "Waiting for the itemized statement",
    ANALYZING: "Matching charges to records",
    REVIEW_REQUIRED: "Your decision is needed",
    CONTACTING_PROVIDER: "Contacting provider billing",
    WAITING_FOR_PROVIDER: "Waiting for provider billing",
    RESOLVED: "Provider response received",
    USER_NOTIFIED: "Investigation complete",
    FAILED: "Investigation needs attention",
  };
  return copy[status];
}

export function getCaseNumbers(caseData: MedicalBillCase): CaseNumbers {
  return {
    original: caseData.transaction.amount,
    corrected: caseData.resolution?.correctedTotal ?? null,
    adjustment: caseData.resolution?.adjustment ?? 0,
  };
}

export function getFindingTone(finding?: Finding) {
  if (!finding) return "neutral" as const;
  if (finding.action === "REQUEST_REVIEW") return "attention" as const;
  if (finding.clinicalStatus === "SUPPORTED") return "supported" as const;
  return "neutral" as const;
}
```

- [ ] **Step 4: Run the focused test and full test suite**

Run: `npm test -- src/components/case-presentation.test.ts && npm test`

Expected: the focused tests and existing suite PASS.

- [ ] **Step 5: Commit the tested mapping layer**

```bash
git add src/components/case-presentation.ts src/components/case-presentation.test.ts
git commit -m "test: define case presentation states"
```

### Task 2: Establish typography and reusable Receipt Trace primitives

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/AppHeader.tsx`
- Create: `src/components/WorkflowRibbon.tsx`
- Create: `src/components/ReceiptTrace.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `MedicalBillCase`, `Finding`, and Task 1 helpers.
- Produces: `AppHeader({ caseId? })`, `WorkflowRibbon({ status })`, and `ReceiptTrace({ caseData, selectedId?, onSelect?, compact? })`.

- [ ] **Step 1: Install dependencies and read the bundled Next.js guides before code changes**

Run: `npm ci`

Then locate the installed guides with:

```bash
rg --files node_modules/next/dist/docs | rg '(font|css|client-components|layout)'
```

Read the relevant font, global CSS, layout, and client-component guides completely. Follow the installed Next.js 16 conventions if they differ from this plan.

- [ ] **Step 2: Configure local Next.js font variables in the root layout**

Update `src/app/layout.tsx` to load Petrona, Albert Sans, and DM Mono with `next/font/google`, expose `--font-display`, `--font-interface`, and `--font-data`, and apply all three font variables to `<body>`.

```tsx
import { Albert_Sans, DM_Mono, Petrona } from "next/font/google";

const display = Petrona({ subsets: ["latin"], variable: "--font-display" });
const interfaceFont = Albert_Sans({ subsets: ["latin"], variable: "--font-interface" });
const data = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data" });
```

- [ ] **Step 3: Build the semantic header and workflow ribbon**

`AppHeader` must link home, show “Medical Bill Guardian,” display the optional case ID, and always label the current experience “Synthetic demo.” `WorkflowRibbon` must render four real stages—Detect, Retrieve, Reconcile, Decide—plus a completed outcome state, using `getDemoStage` and text in addition to color.

- [ ] **Step 4: Build the reusable receipt component**

`ReceiptTrace` must render transaction information before a bill arrives, bill items when available, finding state for each line, selection as semantic `<button>` elements, and original/corrected totals only from structured case facts. The unresolved label must read “Verify,” not “Invalid.”

- [ ] **Step 5: Replace global visual tokens and primitive styles**

Define the six spec colors, typography roles, focus ring, receipt perforation, print shadow, evidence thread, workflow stage, animation, and reduced-motion rules in `src/app/globals.css`. Avoid element selectors that override component classes. Keep styles mobile-first where practical.

- [ ] **Step 6: Verify the primitives compile**

Run: `npm run typecheck`

Expected: PASS with no implicit `any`, invalid font option, or component prop errors.

- [ ] **Step 7: Commit the visual foundation**

```bash
git add src/app/layout.tsx src/app/globals.css src/components/AppHeader.tsx src/components/WorkflowRibbon.tsx src/components/ReceiptTrace.tsx
git commit -m "feat: add receipt trace visual foundation"
```

### Task 3: Rebuild the landing page as a guided demonstration

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: existing `/api/cases` and `/api/transactions/scan` behavior plus `AppHeader`, `ReceiptTrace`, `WorkflowRibbon`, and presentation helpers.
- Produces: a landing page that supports no-case, active-case, and completed-case states without new API behavior.

- [ ] **Step 1: Preserve data behavior and replace dashboard composition**

Keep `scan`, `refresh`, automatic demo scanning, busy state, and error handling. Replace the generic hero art and three metric cards with:

```text
AppHeader
Demo hero copy | ReceiptTrace | connected evidence note
WorkflowRibbon
CaseArchive
Architecture sentence
```

The primary action is “Trace this payment” for a detected case, “Open investigation” for an active case, and “Review the outcome” for a completed case. When no case exists, retain “Scan synthetic account.”

- [ ] **Step 2: Add honest integration and demo copy**

Show the architecture sentence “Bank signal → consented medical records → deterministic reconciliation → authorized provider outreach.” Label the run “Synthetic demo.” Do not show external-provider logos as active connections.

- [ ] **Step 3: Add focused landing-page responsive styles**

Implement the three-column desktop composition, evidence connector, archive list, and mobile single-column order. The receipt animation runs once on page entry; all later interactions use short state transitions.

- [ ] **Step 4: Verify landing-page behavior**

Run: `npm run typecheck && npm test`

Expected: PASS. Manually verify that repeated scans still return one case and that the no-case action remains usable.

- [ ] **Step 5: Commit the landing page**

```bash
git add src/components/Dashboard.tsx src/app/globals.css
git commit -m "feat: turn dashboard into guided demo"
```

### Task 4: Rebuild the case page as an evidence workspace

**Files:**
- Create: `src/components/EvidenceWorkspace.tsx`
- Create: `src/components/SystemView.tsx`
- Modify: `src/components/CaseView.tsx`
- Modify: `src/components/CaseActivity.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: existing case-loading, polling, action, review authorization, and reset functions from `CaseView`; `ReceiptTrace`; `WorkflowRibbon`; audit and communication arrays.
- Produces: `EvidenceWorkspace({ caseData, finding })` and `SystemView({ caseData })`, with Story/System view stored only in `CaseView` state.

- [ ] **Step 1: Extract the selected-finding evidence workspace**

Move the evidence presentation out of `CaseView`. Render “The bill says,” “The record shows,” cautious interpretation, confidence, and the pricing limitation. The authorization control remains in `CaseView` because it owns the action callback.

- [ ] **Step 2: Build System view from recorded facts**

Render provider boundaries, timeline entries, audit tool/action/input/output summaries, and communication transcripts. Mark the active run “Mock providers / synthetic data.” Describe Nessie, FinchNode, and Relay/Photon only as adapter boundaries, not completed calls.

- [ ] **Step 3: Recompose the case page**

Preserve all fetch, polling, request-review, notification, error, and reset behavior. Add a Story/System segmented control. In Story view, render the sticky `ReceiptTrace` rail beside the evidence workspace. In System view, render `SystemView`. Keep the authorization button visible only in `REVIEW_REQUIRED` and keep its request body `{ authorized: true }`.

- [ ] **Step 4: Make each orchestration state demonstrable**

Render state-specific copy and controls for detected, waiting, review-required, and completed states. The completed state must feature the provider-confirmed correction and original-to-corrected amount transition. The waiting state must say that the synthetic statement will arrive automatically.

- [ ] **Step 5: Restyle the activity view as secondary evidence**

Retain `CaseActivity` for disclosure-based access where appropriate, but align its terminology and typography with System view. Do not discard transcripts or tool details.

- [ ] **Step 6: Verify the case experience**

Run: `npm run typecheck && npm test`

Expected: PASS, including authorization and provider-confirmation orchestration tests.

- [ ] **Step 7: Commit the case workspace**

```bash
git add src/components/EvidenceWorkspace.tsx src/components/SystemView.tsx src/components/CaseView.tsx src/components/CaseActivity.tsx src/app/globals.css
git commit -m "feat: create evidence-first case workspace"
```

### Task 5: Perform visual, accessibility, and production verification

**Files:**
- Modify as needed: `src/app/globals.css`
- Modify as needed: `src/components/Dashboard.tsx`
- Modify as needed: `src/components/CaseView.tsx`
- Update if implementation facts changed: `README.md`

**Interfaces:**
- Consumes: the complete frontend from Tasks 1–4.
- Produces: a responsive, accessible, production-building demo and evidence for the pull request.

- [ ] **Step 1: Start the app and exercise the full synthetic flow**

Run: `npm run dev`

Verify in the browser: reset demo, scan transaction, open the case, investigate, observe the waiting state, inspect the $700 line, authorize review, and confirm `$4,820 → $4,120`.

- [ ] **Step 2: Inspect Story and System views against source data**

Confirm the tool names, audit actions, timestamps, transcript status, and summary source match the returned case. Verify that no screen claims a live Nessie, FinchNode, Relay, or Photon call.

- [ ] **Step 3: Audit responsive and accessible behavior**

Check desktop, tablet, and phone widths; keyboard-select each charge and both view modes; confirm visible focus; enable reduced motion and verify that receipt/thread animations stop; confirm alert text remains readable without color.

- [ ] **Step 4: Critique screenshots and remove one unnecessary visual element**

Capture desktop landing, review-required case, completed case, and mobile case screenshots. Fix overflow, spacing, hierarchy, or contrast issues. Remove any decoration that does not help explain the case.

- [ ] **Step 5: Run final automated verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: all tests PASS, TypeScript exits successfully, and the production build completes.

- [ ] **Step 6: Commit final polish**

```bash
git add src README.md
git commit -m "polish: refine responsive demo experience"
```

### Task 6: Push the branch and open the pull request

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: clean verified branch `codex/receipt-trace-demo`.
- Produces: a GitHub pull request attached to the current task.

- [ ] **Step 1: Confirm branch state and commit history**

Run: `git status --short && git log --oneline --decorate -8`

Expected: clean status and focused design, presentation, landing, workspace, and polish commits.

- [ ] **Step 2: Push the feature branch**

Run: `git push -u origin codex/receipt-trace-demo`

- [ ] **Step 3: Create the pull request**

Use `gh pr create` with a title such as `Redesign demo around receipt trace workflow`. The body must summarize the judge-oriented design, state that the run remains synthetic, list verification commands, and note that provider integrations are displayed as boundaries rather than live calls.

- [ ] **Step 4: Attach the pull request to the task**

After GitHub returns the PR URL, call the Codex pull-request attachment tool with that exact URL.
