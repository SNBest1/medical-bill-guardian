# SpacetimeDB backend — design

Date: 2026-10-03 · Branch: `feat/spacetimedb-backend` · Status: awaiting review

## Purpose

Medical Bill Guardian is entering a SpacetimeDB hackathon track. SpacetimeDB must visibly do the work in the demo — hold the case state machine and push live updates — not sit behind the app as a storage swap. Judges open a public link and run the University Hospital story themselves.

**Success criteria**

1. A judge opens the public URL, and their own demo case appears without setup.
2. Clicking **Investigate** shows records immediately; the itemized bill arrives about 2 seconds later with no reload or polling.
3. After **Authorize billing review**, the case ends at `USER_NOTIFIED` with the $4,820 → $4,120 correction and a plain-language summary.
4. A second browser identity cannot see or act on the first identity's case.
5. Existing safety rules hold: missing evidence means "needs review", never proof of error; provider contact requires the owner's explicit authorization; data is synthetic only.

## Decisions (agreed in brainstorming)

| Decision | Choice | Reason |
| --- | --- | --- |
| How much moves into SpacetimeDB | The whole backend: tables, workflow, scheduling | Strongest showing for the track |
| Hosting | Module on Maincloud; frontend on Cloudflare Workers static assets | Judges need a public link |
| Frontend framework | Vite + React (replaces Next.js) | API routes are gone; matches the SpacetimeDB template and the default stack |
| OpenAI summary rephrasing | Dropped | Modules have no env vars; secret handling is not worth it for wording; local-first default |
| Live integrations | Out of scope; live mode stays impossible | No identity, consent, or encrypted storage yet |

## Architecture

```text
 Browser (React + Vite, Cloudflare Workers static assets)
   │  subscribes to per-user views: my_cases, my_timeline, ...   ◄── live pushes
   │  calls reducers: scan_demo_payment, investigate_case,
   │                  authorize_review, reset_demo
   ▼
 SpacetimeDB module (TypeScript, Maincloud, wss://maincloud.spacetimedb.com)
   ├─ private tables: bill_case, medical_record, bill_item, finding,
   │                  timeline_event, audit_entry, communication
   ├─ public views filtered by ctx.sender (case owner)
   ├─ reducers: the case state machine
   ├─ schedule table bill_delivery → deliver_bill (~2 s after investigation)
   └─ pure logic moved from src/services: reconcile, matchEncounter, parseItemizedBill,
      demo fixtures, mock provider responses, deterministic summary
```

Repository layout follows the `chat-react-ts` template: the module lives in `spacetimedb/`, the Vite app in root `src/`, generated bindings in `src/module_bindings/` (committed, so the frontend builds without the CLI). The template is scaffolded in scratch space and copied selectively; it is never run on top of this repository.

Removed in the commit that replaces them: Next.js, `src/app/`, `src/lib/db.ts`, `better-sqlite3`, `src/proxy.ts`, `src/lib/providers.ts`, `DEMO_MODE`. The Nessie and FinchNode adapters and their tests stay in `src/services/` as reference for later live work; nothing imports them, so they are not bundled. Docs say so.

The module contains only the mock providers, so it has no code path to a bank, EHR, or hospital. This replaces the `DEMO_MODE=false` route guard with a stronger guarantee.

## Data model

All tables are private (the default). Clients read only through views.

| Table | Columns |
| --- | --- |
| `bill_case` | `id u64 PK autoInc` · `owner identity [btree]` · `label string` ("CASE-4821") · `status CaseStatus` · `transaction_id string` · `merchant string` · `amount_cents i64` · `paid_on string` (YYYY-MM-DD) · `invoice_id option<string>` · `bill_total_cents option<i64>` · `resolution option<Resolution>` · `summary option<string>` · `created_at timestamp` · `updated_at timestamp` |
| `medical_record` | `id u64 PK autoInc` · `case_id u64 [btree]` · `owner identity [btree]` · `kind` · `description` · `date` · `provider` |
| `bill_item` | `id` · `case_id` · `owner` · `description` · `code option<string>` · `amount_cents i64` · `service_date` |
| `finding` | `id` · `case_id` · `owner` · `bill_item_id option<u64>` · `description` · `amount_cents` · `clinical_status` · `pricing_status` · `confidence f64` · `evidence array<string>` · `explanation` · `action` |
| `timeline_event` | `id` · `case_id` · `owner` · `at timestamp` · `title` · `detail` · `source` · `status` |
| `audit_entry` | `id` · `case_id` · `owner` · `at` · `action` · `tool` · `input_summary` · `output_summary` · `status` |
| `communication` | `id` · `case_id` · `owner` · `kind` · `at` · `status` · `transcript` · `result option<string>` |
| `bill_delivery` (schedule) | `scheduled_id u64 PK autoInc` · `scheduled_at scheduleAt` · `case_id u64` |

`Resolution` is a `t.object` with `result`, `original_total_cents`, `corrected_total_cents`, `adjustment_cents`, `explanation`.

Rules:

1. **`owner` is denormalized onto every child row with a btree index**, so each view is one indexed filter on `ctx.sender` without joins.
2. **Money is integer cents (`i64`).** The reconciliation total check becomes exact equality. The UI formats dollars.
3. **Uniqueness is per (owner, transaction_id)**, enforced inside `scan_demo_payment`. Each judge gets their own case; repeated scans are no-ops.
4. **Status-like fields are SpacetimeDB enums** mirroring the unions in `src/types/domain.ts`, so generated client types catch mistakes at compile time. If the 2.10 enum encoding makes the client mapping awkward, fall back to `t.string()` validated in the reducer; record the choice in CLAUDE.md.
5. **`resolution` and `summary` live on `bill_case`** — exactly one per case, changing together with `status`.
6. **Auto-increment IDs replace `crypto.randomUUID()`** (reducers must be deterministic) and give the timeline a stable order. All times come from `ctx.timestamp`.

Not modeled: a transaction table (the transaction lives on the case) and consent records (belong to live-mode work).

**Views** (public, per-user, each filtering by `owner == ctx.sender`): `my_cases`, `my_medical_records`, `my_bill_items`, `my_findings`, `my_timeline`, `my_audit_log`, `my_communications`. The client reassembles the existing `MedicalBillCase` shape from them so components change little.

## Reducer flow

| Reducer | Guard | Effect |
| --- | --- | --- |
| `scan_demo_payment()` | — | If the caller has no case for the demo transaction, insert `bill_case` (`DETECTED`) with timeline "Hospital payment detected" and audit `CREATE_CASE`. Otherwise no-op. |
| `investigate_case(case_id)` | Caller owns the case (else throw). Status `DETECTED` (else no-op). | Insert mock medical records; match the encounter (timeline + audit); insert a `PENDING` bill-request communication; insert `bill_delivery` at `ctx.timestamp + 2 s`; status `WAITING_FOR_BILL`. |
| `deliver_bill(row)` — scheduled | Must only run from the scheduler; a client call must be rejected (verify the 2.10 idiom, e.g. comparing `ctx.sender` with the module identity). Status `WAITING_FOR_BILL` (else no-op). | Parse the demo statement into `bill_item` rows; mark the request `COMPLETED`; reconcile into `finding` rows; timeline "Itemized bill received", "Bill analyzed". If any finding needs review: status `REVIEW_REQUIRED` and an attention event "Your approval is needed". Otherwise call `finishCase`. |
| `authorize_review(case_id)` | Caller owns the case and status is `REVIEW_REQUIRED` (else throw). | Mark the approval event complete ("You authorized billing review"); record the mock billing-review communication; set the resolution ($4,820 → $4,120); call `finishCase`. |
| `reset_demo()` | — | Delete every row whose `owner` is the caller across all tables, including pending `bill_delivery` rows for those cases. The client then calls `scan_demo_payment`. |

`finishCase` is an unexported helper: it sets `RESOLVED`, builds the deterministic summary (today's fallback text in `notifyCase`), records the `USER_NOTIFICATION` communication and audit entries, and sets `USER_NOTIFIED`.

`FETCHING_RECORDS`, `REQUESTING_BILL`, and `ANALYZING` occur inside a single transaction and are never visible to clients; they stay in the enum to match `domain.ts`.

## Error handling

- A thrown reducer rolls back its whole transaction, so a case cannot be left half-investigated. Clients receive the failure through the reducer call and show it inline beside the button that triggered it.
- Owner mismatch, and `authorize_review` in any status other than `REVIEW_REQUIRED`, throw `SenderError`. Provider contact is reachable only through the owner's explicit authorization.
- Repeated `scan_demo_payment` and `investigate_case` calls are silent no-ops, matching current behavior, so double clicks are harmless.
- The scheduled reducer rejects direct client calls, so a client cannot force the bill to arrive early.
- The client shows a "Connecting…" state until the connection is active and a clear message on connection error. If `localStorage` is unavailable, the app still works; the identity simply does not survive a reload.

## Client

- `main.tsx` follows the template: `DbConnection.builder()` with `VITE_SPACETIMEDB_HOST` and `VITE_SPACETIMEDB_DB_NAME`, token saved in `localStorage` under a host/database key, wrapped in `SpacetimeDBProvider`.
- On first connect, the dashboard calls `scan_demo_payment`.
- `Dashboard`, `CaseView`, and `CaseActivity` are ported from Next.js to Vite, reading from `useTable` subscriptions instead of `fetch`. Navigation between the dashboard and a case uses component state (no router dependency) unless a deep link proves necessary.
- Existing styling in `globals.css` is reused.

## Deployment

**Backend.** `spacetime publish <db-name> --module-path spacetimedb` to Maincloud, database name `medical-bill-guardian` (or a variant if taken). Incompatible schema changes use `--delete-data`; acceptable because every case is synthetic. Development and the smoke test use a local `spacetime start` server first. Each Maincloud publish needs the user's explicit yes.

**Frontend.** `npm run build` → `dist/`, deployed with `wrangler deploy`. `wrangler.jsonc` includes `$schema`, `observability.enabled`, `assets.directory: "./dist"`, and `assets.not_found_handling: "single-page-application"`, following the mason-property-dashboard reference. Each deploy needs the user's explicit yes.

**Configuration.** `.env.example` lists `VITE_SPACETIMEDB_HOST` and `VITE_SPACETIMEDB_DB_NAME` with comments. These are public values compiled into the bundle, not secrets. Old Nessie/FinchNode/Relay/OpenAI variables are kept with a note that only the unused reference adapters read them.

Both CLIs are installed and logged in (SpacetimeDB 2.10.2, wrangler).

## Testing

1. **Unit (Vitest):** `reconcile`, `matchEncounter`, `parseItemizedBill`, and the summary builder, converted to cents. The module's pure logic lives in plain TypeScript files importable by Vitest without the SpacetimeDB runtime.
2. **Smoke (`npm run smoke`):** publish to a local server, run the full story through the CLI (`spacetime call`, `spacetime sql`), and assert final status `USER_NOTIFIED` and corrected total 412000 cents. A second identity must fail to call `authorize_review` on the first identity's case and must see zero rows in `my_cases`.
3. **Manual:** walk the demo in the browser preview against local, then against Maincloud from the deployed URL, in two browser profiles.
4. `npm run typecheck` and `npm run build` pass.

## Documentation

Updated in the same commits as the code: README (purpose, new architecture diagram, quick start: install CLI → `spacetime start` → publish locally → generate bindings → `npm run dev`), CLAUDE.md (where logic lives and why — per-user views, scheduled delivery, cents, the mock-only module), AGENTS.md (remove the auto-generated Next.js block, which no longer applies; describe the new architecture), PROJECT_CHECKLIST.md, `.env.example`.

## Commits (regular, focused)

1. This spec.
2. Module: schema, pure logic moved and converted to cents, reducers, views; unit tests passing.
3. Smoke script against the local server.
4. Vite client replacing Next.js; components ported; docs updated.
5. Cloudflare config and deployment docs.

## Out of scope

OpenAI summary rephrasing; live Nessie, FinchNode, and Relay integrations; real authentication, consent records, and encrypted storage; real statement parsing and price references; a client router.
