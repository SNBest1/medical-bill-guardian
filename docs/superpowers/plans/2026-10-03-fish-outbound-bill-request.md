# Fish Audio Outbound Bill Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicitly authorized case action that queues a real Fish Audio call to the configured demo hospital recipient and then resumes the deterministic itemized-bill workflow.

**Architecture:** Keep telephony behind `CommunicationProvider` with a focused Fish demo adapter that performs the real outbound request while delegating statement delivery, later review, and notification to the existing mock provider. Split investigation from bill request at the existing `REQUESTING_BILL` state, add one server-only route for authorization, and expose the transition through the case decision panel.

**Tech Stack:** Next.js 16 App Router route handlers, React 19, TypeScript 5.9, native `fetch`, Vitest, SQLite-backed complete-case persistence.

**Spec:** `docs/superpowers/specs/2026-10-03-fish-outbound-bill-request-design.md`

## Global Constraints

- Use only `FISH_API_KEY`, `FISH_AGENT_ID`, `FISH_PHONE_NUMBER_ID`, and `FISH_TEST_TO_NUMBER`; all remain server-only.
- The browser sends only `{ "authorized": true }`; it cannot choose the destination.
- A real call occurs only from `REQUESTING_BILL` after explicit authorization.
- The Fish request body contains only `agent_id`, `phone_number_id`, and `to_number`.
- The `Idempotency-Key` is stable per case action and contains no timestamp.
- Only HTTP `201` with a non-empty `session_id` counts as success.
- The returned statement remains the existing synthetic fixture and must be labeled as such.
- Do not change the `DEMO_MODE=false` proxy guard or enable the unfinished live-provider path.
- Never run a real Fish call from automated tests or implementation verification.

---

### Task 1: Fish demo communication adapter

**Files:**
- Modify: `src/services/communications/provider.ts`
- Create: `src/services/communications/fish-demo.ts`
- Create: `src/services/communications/fish-demo.test.ts`
- Modify: `src/services/communications/mock.ts`
- Modify: `src/lib/providers.ts`
- Create: `src/lib/providers.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `ItemizedBillRequestContext = { caseId: string; providerName: string }`.
- Produces: `CommunicationProvider.requestItemizedBill(context: ItemizedBillRequestContext): Promise<Communication>`.
- Produces: `FishDemoCommunicationProvider` implementing `CommunicationProvider`.
- Produces: `FishCallError` with public `status: number` and `responseBody: string`.
- Consumes: the existing `MockCommunicationProvider` for deterministic statement delivery, later review, and notification.

- [ ] **Step 1: Write failing adapter tests**

Create `fish-demo.test.ts` with a fake `fetch` and explicit configuration. Assert that `requestItemizedBill({ caseId: "CASE-4821", providerName: "University Hospital" })` sends:

```ts
expect(fetcher).toHaveBeenCalledWith(
  "https://api.fish.audio/v1/agent/phone-calls",
  expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({
      Authorization: "Bearer fish-secret",
      "Content-Type": "application/json",
      "Idempotency-Key": "medical-bill-guardian:CASE-4821:request-itemized-bill",
    }),
    body: JSON.stringify({
      agent_id: "agent-1",
      phone_number_id: "phone-1",
      to_number: "+13135550199",
    }),
  }),
);
expect(result.status).toBe("PENDING");
expect(result.result).toContain("session-1");
expect(result.transcript).toContain("ending 0199");
```

Also test non-`201` propagation, missing `session_id`, E.164 rejection, and that the error text contains neither `fish-secret` nor the full destination number.

- [ ] **Step 2: Run the adapter test and verify it fails**

Run: `npm test -- src/services/communications/fish-demo.test.ts`

Expected: FAIL because `FishDemoCommunicationProvider` does not exist.

- [ ] **Step 3: Update the provider contract and mock**

In `provider.ts`, add:

```ts
export interface ItemizedBillRequestContext {
  caseId: string;
  providerName: string;
}

export interface CommunicationProvider {
  requestItemizedBill(context: ItemizedBillRequestContext): Promise<Communication>;
  getItemizedBill(providerName: string, request: Communication): Promise<string | null>;
  requestBillingReview(providerName: string, invoiceId: string, findings: Finding[]): Promise<{ resolution: Resolution; communication: Communication }>;
  notifyUser(summary: string): Promise<Communication>;
}
```

Update `MockCommunicationProvider.requestItemizedBill` to read `context.providerName` and preserve its existing fixture restriction and pending communication behavior.

- [ ] **Step 4: Implement the Fish demo adapter**

Create a server-only adapter with injected `fetch` for tests:

```ts
export type FishDemoConfig = {
  apiKey: string;
  agentId: string;
  phoneNumberId: string;
  toNumber: string;
};

export class FishCallError extends Error {
  constructor(public readonly status: number, public readonly responseBody: string) {
    super(`Fish Audio call failed with HTTP ${status}: ${responseBody}`);
  }
}

export class FishDemoCommunicationProvider implements CommunicationProvider {
  constructor(
    private readonly config: FishDemoConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly fallback = new MockCommunicationProvider(),
  ) {}
}
```

Implement `requestItemizedBill` with the Fish call. Implement `getItemizedBill`, `requestBillingReview`, and `notifyUser` as direct calls to the same methods on `fallback`. Validate configuration before calling, mask the destination to `ending 0199`, safely stringify JSON or text error responses, redact the API key and full destination from errors, and create a pending communication whose result is `Fish call queued · session session-1`.

- [ ] **Step 5: Run adapter tests**

Run: `npm test -- src/services/communications/fish-demo.test.ts`

Expected: PASS with no network traffic.

- [ ] **Step 6: Write failing provider-selection tests**

In `providers.test.ts`, snapshot and restore the four Fish environment variables. Assert that `communicationProvider()` returns `MockCommunicationProvider` when any value is absent and `FishDemoCommunicationProvider` only when all four are present and `DEMO_MODE` is not `false`.

- [ ] **Step 7: Implement provider selection and document variables**

Update `communicationProvider()` to construct `FishDemoCommunicationProvider` only when all four values are non-empty. Add the following commented entries to `.env.example`:

```dotenv
# Fish Audio published agent used only for an explicitly authorized demo call.
FISH_API_KEY=
FISH_AGENT_ID=
FISH_PHONE_NUMBER_ID=
# Consenting teammate role-playing hospital billing, in E.164 format.
FISH_TEST_TO_NUMBER=
```

- [ ] **Step 8: Run provider tests and commit**

Run: `npm test -- src/services/communications/fish-demo.test.ts src/lib/providers.test.ts`

Expected: PASS.

Commit:

```bash
git add .env.example src/services/communications/provider.ts src/services/communications/mock.ts src/services/communications/fish-demo.ts src/services/communications/fish-demo.test.ts src/lib/providers.ts src/lib/providers.test.ts
git commit -m "feat: add Fish demo communication adapter"
```

---

### Task 2: Explicit bill-request orchestration

**Files:**
- Modify: `src/services/agent/orchestrator.ts`
- Modify: `src/services/agent/orchestrator.test.ts`

**Interfaces:**
- Consumes: `CommunicationProvider.requestItemizedBill({ caseId, providerName })` from Task 1.
- Produces: `investigateCase(current, medical)` that stops at `REQUESTING_BILL`.
- Produces: `requestItemizedBill(current, communications, authorized): Promise<MedicalBillCase>`.

- [ ] **Step 1: Rewrite workflow tests to express the authorization checkpoint**

Change the main workflow test to assert:

```ts
const ready = await investigateCase(initial, new MockMedicalRecordProvider());
expect(ready.status).toBe("REQUESTING_BILL");
expect(ready.communications).toHaveLength(0);

await expect(requestItemizedBill(ready, provider, false)).rejects.toThrow(/authorization/i);
const waiting = await requestItemizedBill(ready, provider, true);
expect(waiting.status).toBe("WAITING_FOR_BILL");
expect(waiting.communications).toHaveLength(1);
```

Add tests rejecting the wrong state and a duplicate existing itemized-bill request. Update every existing test helper chain to invoke the new request operation between investigation and analysis.

- [ ] **Step 2: Run the orchestration tests and verify failure**

Run: `npm test -- src/services/agent/orchestrator.test.ts`

Expected: FAIL because investigation still contacts the provider and the new operation is absent.

- [ ] **Step 3: Split investigation from the request operation**

Remove the communication-provider argument and request side effect from `investigateCase`. End it with `next.status = "REQUESTING_BILL"`.

Add:

```ts
export async function requestItemizedBill(
  current: MedicalBillCase,
  communications: CommunicationProvider,
  authorized: boolean,
): Promise<MedicalBillCase>
```

Require explicit authorization, exact `REQUESTING_BILL` status, and no prior request. Call the provider with the case ID and provider name, append its communication, record `REQUEST_BILL`, and advance to `WAITING_FOR_BILL`. Use wording that distinguishes “call queued” from “statement received.”

- [ ] **Step 4: Run the orchestration suite and commit**

Run: `npm test -- src/services/agent/orchestrator.test.ts`

Expected: PASS.

Commit:

```bash
git add src/services/agent/orchestrator.ts src/services/agent/orchestrator.test.ts
git commit -m "feat: require authorization before bill request"
```

---

### Task 3: Server route for the authorized call

**Files:**
- Modify: `src/app/api/cases/[id]/run/route.ts`
- Create: `src/app/api/cases/[id]/request-bill/route.ts`
- Create: `src/app/api/cases/[id]/request-bill/route.test.ts`

**Interfaces:**
- Consumes: `investigateCase(current, medicalProvider())` and `requestItemizedBill(current, communicationProvider(), authorized)`.
- Produces: `POST /api/cases/[id]/request-bill` accepting `{ authorized?: boolean }`.

- [ ] **Step 1: Write route tests with mocked storage and providers**

Test these results by invoking `POST` directly with a `Request` and `{ params: Promise.resolve({ id }) }`:

```ts
expect(response.status).toBe(200); // authorized successful request
expect((await response.json()).status).toBe("WAITING_FOR_BILL");
```

Also assert `404` for a missing case, `400` when authorization is absent, and preservation of a safe `FishCallError` status/body without mutating the saved case. Mock the communication provider so the route test cannot perform a real call.

- [ ] **Step 2: Run the route test and verify failure**

Run: `npm test -- src/app/api/cases/[id]/request-bill/route.test.ts`

Expected: FAIL because the route is absent.

- [ ] **Step 3: Implement the route and update `/run`**

Follow the installed Next.js 16 route-handler convention in `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`: keep `runtime = "nodejs"` and await `context.params`.

The new route parses `{ authorized?: boolean }`, loads the case, invokes the orchestrator, saves only a successful result, and returns JSON. For `FishCallError`, return a JSON error containing the exact upstream status and safe body and use the same upstream HTTP status. Return `400` for state or authorization errors. Update `/run` to stop constructing a communication provider.

- [ ] **Step 4: Run route and orchestration tests and commit**

Run: `npm test -- src/app/api/cases/[id]/request-bill/route.test.ts src/services/agent/orchestrator.test.ts`

Expected: PASS.

Commit:

```bash
git add src/app/api/cases/[id]/run/route.ts src/app/api/cases/[id]/request-bill/route.ts src/app/api/cases/[id]/request-bill/route.test.ts
git commit -m "feat: expose authorized hospital call route"
```

---

### Task 4: Case authorization and queued-call presentation

**Files:**
- Modify: `src/components/CaseView.tsx`
- Modify: `src/components/SystemView.tsx`
- Modify: `src/components/case-presentation.ts`
- Modify: `src/components/case-presentation.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `REQUESTING_BILL`, `WAITING_FOR_BILL`, pending communication transcript/result, and `POST /api/cases/[id]/request-bill`.
- Produces: `getItemizedBillRequestCopy(status: CaseStatus): { heading: string; detail: string } | null`, covered by unit tests.

- [ ] **Step 1: Add failing presentation assertions**

Extend `case-presentation.test.ts` to require `REQUESTING_BILL` copy that says authorization is needed and `WAITING_FOR_BILL` copy that says the call is queued while the synthetic statement is prepared. Assert that neither string claims the call delivered a statement.

- [ ] **Step 2: Run presentation tests and verify failure**

Run: `npm test -- src/components/case-presentation.test.ts`

Expected: FAIL on the new copy assertions.

- [ ] **Step 3: Implement the authorization panel**

In `CaseView`, render a coral authorization panel when status is `REQUESTING_BILL`. Include:

```tsx
<h2>Call hospital billing for the itemized statement?</h2>
<p>The AI agent will call the configured consenting demo recipient and request service dates, billing codes, charges, adjustments, and patient responsibility. No real patient information should be shared.</p>
<button onClick={() => action("request-bill", { authorized: true })}>
  {busy ? "Calling hospital…" : "Authorize hospital call"}
</button>
```

Keep the `WAITING_FOR_BILL` panel, but change its heading to **Call queued. Preparing the demo statement.** and explicitly say that the statement is a synthetic fixture, not a document collected by the call. Ensure the polling effect still starts only at `WAITING_FOR_BILL`.

- [ ] **Step 4: Make System view accurately describe the hybrid run**

When a communication result contains `Fish call queued`, label the communication boundary as `Fish Audio outbound call + synthetic statement fixture`; otherwise preserve the mock-provider description. Continue showing the session ID already stored in the communication result, without rendering credentials or phone numbers.

- [ ] **Step 5: Add restrained styling and run tests**

Add only targeted classes for the call brief/disclosure within the existing decision-panel visual language. Preserve mobile stacking, visible focus, and reduced-motion behavior.

Run: `npm test -- src/components/case-presentation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the UI change**

```bash
git add src/components/CaseView.tsx src/components/SystemView.tsx src/components/case-presentation.ts src/components/case-presentation.test.ts src/app/globals.css
git commit -m "feat: add hospital call authorization step"
```

---

### Task 5: Full regression and safe demo verification

**Files:**
- Modify only if verification exposes a defect in a file already named above.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4.
- Produces: a tested branch ready to update the existing pull request.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all Vitest suites pass and no test contacts `api.fish.audio`.

- [ ] **Step 2: Run static verification**

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0 and the new `/api/cases/[id]/request-bill` route appears in the build output.

- [ ] **Step 3: Run the local UI without Fish configuration**

Start the existing development server and exercise reset → start investigation → authorize hospital call → wait for synthetic statement → analyze. Confirm the fallback mock path makes no network call and reaches `REVIEW_REQUIRED`.

- [ ] **Step 4: Verify the Fish path without placing a call**

Use the adapter unit test or a local mocked `fetch`; do not click the authorization button while real Fish variables are loaded. Confirm the payload, stable idempotency key, queued session reference, and exact safe error display.

- [ ] **Step 5: Review the final diff and update the pull request**

Run:

```bash
git status --short
git diff --check
git log --oneline --decorate -8
```

Expected: clean formatting, only scoped changes, and no `.env`, database, API key, or phone number in Git. Push `codex/receipt-trace-demo`; the existing pull request should update automatically. Amend its description with the authorization gate, Fish Audio side effect, synthetic statement boundary, and verification results.

---

### Task 6: Scope idempotency to the configured destination

**Files:**
- Modify: `src/services/communications/fish-demo.ts`
- Modify: `src/services/communications/fish-demo.test.ts`

**Interfaces:**
- Produces: `fishCallIdempotencyKey(caseId: string, toNumber: string): string`.
- Consumes: Node's built-in `createHash` from `node:crypto`; no new dependency.

- [ ] **Step 1: Add failing idempotency tests**

Add assertions that two calls for `CASE-4821` and the same normalized destination send the same `Idempotency-Key`, while changing only the destination sends a different key. Assert that neither full destination nor its final four digits occur in either key.

```ts
expect(fishCallIdempotencyKey("CASE-4821", "+13135550199"))
  .toBe(fishCallIdempotencyKey("CASE-4821", "+13135550199"));
expect(fishCallIdempotencyKey("CASE-4821", "+13135550199"))
  .not.toBe(fishCallIdempotencyKey("CASE-4821", "+13135558688"));
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/services/communications/fish-demo.test.ts`

Expected: FAIL because `fishCallIdempotencyKey` is not exported and the existing key ignores the destination.

- [ ] **Step 3: Implement the destination fingerprint**

Create the key from a normalized E.164 destination and a 16-character hexadecimal SHA-256 prefix:

```ts
import { createHash } from "node:crypto";

export function fishCallIdempotencyKey(caseId: string, toNumber: string) {
  const destinationFingerprint = createHash("sha256").update(toNumber.trim()).digest("hex").slice(0, 16);
  return `medical-bill-guardian:${caseId}:request-itemized-bill:${destinationFingerprint}`;
}
```

Use this function in the outbound request header. Do not add timestamps, random values, raw phone digits, or mutable process state.

- [ ] **Step 4: Run full safe verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all commands pass; tests use injected `fetch` and no real Fish call occurs.

- [ ] **Step 5: Commit and restart the demo**

```bash
git add src/services/communications/fish-demo.ts src/services/communications/fish-demo.test.ts docs/superpowers/plans/2026-10-03-fish-outbound-bill-request.md
git commit -m "fix: scope Fish idempotency to destination"
```

Stop the current Next.js process and run `npm run dev` again so the demo serves the verified change on port 3000. Do not press the authorization button; the user performs the real call.
