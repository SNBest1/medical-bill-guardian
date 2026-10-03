# FinchNode clinical records — handoff

Verified October 3, 2026, ~22:35 EDT. Owner: Chat 3 (`src/services/medical/**`).

## What's resolved in this pass

- **Confirmed the correct subject-resolution flow** against FinchNode's live sandbox docs
  (quickstart, record model, read-and-paginate, sandbox controls — all under
  `https://finchnode.com/docs/...`): a Connect session is created, `simulate` is called
  with a scenario, and the session is polled until `simulation.state === "completed"`, at
  which point the session body itself carries `subject`. **`GET /users` is documented as
  an admin/reconciliation listing of already-active shares — it will never resolve the
  patient behind a session that hasn't finished simulating**, and must never be used to
  guess a subject. The existing code already followed this (it only ever read
  `FINCHNODE_SUBJECT` from the environment), so no code change was needed there.
- **Reproduced the stuck-session problem independently.** The previously recorded session
  (`FINCHNODE_CONNECT_SESSION` in `.env.local`) has been in `simulation.state: "syncing"`
  with `subject: null` since at least 18:22 EDT today. I started a **second, brand-new**
  session (`cs_275cd42ddb8ddf202a07`, scenario `baseline-adult`, categories
  `encounters,medications,labs,documents`) to rule out a stale/expired session as the
  cause. Its one-time sync completed in ~4 seconds and correctly granted
  `encounters`/`medications`/`labs` (sandbox source declined `documents` for this
  scenario, which is expected, not an error), but `simulation.state` stayed `"syncing"`
  for 2+ minutes of active polling and has not since advanced. **This is a sandbox-side
  finalization issue** (the step that assigns `subject` and flips `simulation.state` to
  `completed`), not a bug in our integration code or polling logic.
- **Added provider/date context filtering** (`matchesEncounterContext` in
  `src/services/medical/finchnode.ts`) so that once a subject *is* available, only records
  whose `provider` matches the paid merchant and whose `date` falls in the same
  0–14-day pre-payment window used by `matchEncounter` (`reconciliation/matcher.ts`) are
  returned as evidence. A FinchNode subject can carry years of unrelated synthetic
  history; without this filter, an unrelated encounter at a different provider or on a
  different date could be mistaken for support of a charge it has nothing to do with. This
  directly satisfies "do not attach unrelated sandbox records to the demo payment."
- **Distinguished failure modes** with `FinchNodeConfigError` (no key/subject configured —
  can't even attempt the read) and `FinchNodeConsentError` (FinchNode's documented `410
  consent_inactive` — the patient revoked or let consent expire). Both still throw, which
  is the existing "fail safely" contract `investigateCase` already expects (the case is
  marked failed rather than silently treated as "zero evidence found"). A genuinely
  resolved query that simply finds no matching records for the window still returns `[]`,
  which `reconcile.ts` already treats as `INSUFFICIENT_DATA` — never as a confirmed error.
- Claims remain excluded from clinical evidence (`normalizeFinchRecords` never maps the
  `claims` category), matching FinchNode's own category table (claims map to
  `ExplanationOfBenefit`/`Coverage`, billing artifacts, not proof of care).
- Added `scripts/finchnode-start-session.mjs` and `scripts/finchnode-resolve-session.mjs`
  so resolving a subject is a repeatable operator action instead of ad hoc curl, and so
  this can be re-run once the sandbox unsticks without guessing at the API shape again.

## What's still blocked

`FINCHNODE_SUBJECT` is **still empty**. Two independent Connect sessions (the original and
the one started in this session) are both stuck in `simulation.state: "syncing"` with
`subject: null`, despite the underlying one-time sync completing successfully. Per
FinchNode's docs this import step normally finishes in seconds. There is no documented
error state surfaced for this — it is not `failed`, just indefinitely `syncing` — so there
is nothing in the API response to branch on. This is accurately a sandbox limitation, not
something fixable from our side. The demo accordingly stays on `MockMedicalRecordProvider`
(`DEMO_MODE=true`), as instructed.

## Not a FinchNode category

FinchNode's fixed category list is `demographics, medications, conditions, labs, vitals,
allergies, immunizations, encounters, documents, claims` — there is no `imaging` or
`procedure` category. `domain.ts`'s `MedicalRecord.type` includes `"imaging"` and
`"procedure"` for other sources (the demo fixture uses them), but `FinchNodeProvider` will
never populate those two types; CT/X-ray/suture evidence from a live FinchNode subject
would arrive as `document` (via `diagnosticReports`) or not at all if the source didn't
share a structured record for it. This is a real evidentiary gap to flag in any live demo,
not something to paper over by inventing a mapping that isn't backed by the API.

## How to retry subject resolution

```bash
# Start a new sandbox Connect session + simulation (or reuse FINCHNODE_CONNECT_SESSION):
node scripts/finchnode-start-session.mjs

# Poll it until it completes or fails:
node scripts/finchnode-resolve-session.mjs <sessionId>

# Once it prints a subject, set it in .env.local:
FINCHNODE_SUBJECT=u_...
```

Only set `FINCHNODE_SUBJECT` from a `completed` session's own `subject` field. Never from
`GET /users`, and never by reusing FinchNode's public demo/sample subject IDs as if they
were an authenticated subject for this application.

## How to enable the live adapter once a subject resolves

1. Confirm `FINCHNODE_API_KEY`, `FINCHNODE_BASE_URL`, and the resolved `FINCHNODE_SUBJECT`
   are set in `.env.local`.
2. `src/lib/providers.ts` already selects `FinchNodeProvider` whenever `DEMO_MODE=false` —
   no code change needed there. Do **not** flip `DEMO_MODE` yet: per `AGENTS.md`, the live
   guard in `src/proxy.ts` stays until identity, per-patient consent, encrypted storage,
   and a live communication adapter exist. Flipping `DEMO_MODE` is a cross-cutting decision
   for the integration owner, not something Chat 3 should do unilaterally.
3. Before trusting any live result end-to-end: verify the resolved subject's records
   actually include an encounter with `provider` matching `University Hospital` (or
   whatever the live transaction's merchant is) inside the matching window — if the
   synthetic scenario doesn't happen to generate a matching encounter, `getMedicalRecords`
   will correctly return `[]`, which is expected, not a bug.
