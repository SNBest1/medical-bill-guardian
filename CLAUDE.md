@AGENTS.md

# Medical Bill Guardian — handoff (2026-10-03)

Read `AGENTS.md` for repository rules and architecture, then `README.md` for setup and `PROJECT_CHECKLIST.md` for the complete task list. This file records the state of the work so the next session can resume without assuming the live integrations are finished.

## Goal and current result

Build a medical billing assistant that detects a hospital payment, obtains patient-authorized records and an itemized bill, checks each charge against clinical evidence, asks the patient before contacting billing, and explains the provider-confirmed outcome. The **complete synthetic demo works**. Live patient use is intentionally disabled.

The demo story is University Hospital, September 28, 2026: a $4,820 payment and six charges. Five charges have supporting mock records. The $700 specialist consultation has no matching clinical evidence, so the app requests review without calling it invalid. After the user authorizes review, the mock hospital confirms it duplicated services already included in the ER charge. The corrected total is $4,120. No bank chargeback or real hospital contact occurs.

## Repository and run commands

- Private GitHub repository: `git@github.com:SNBest1/medical-bill-guardian.git`, branch `main`. The user requested regular, focused commits; existing work was committed in batches.
- Stack: Next.js 16, React 19, TypeScript, pinned npm dependencies, SQLite. PostgreSQL/Prisma from the original proposal has not been added.
- Start: `npm ci`, `cp .env.example .env`, `npm run dev`; open `http://localhost:3000`. The development server is not guaranteed to be running when you resume.
- Verify: `npm test`, `npm run typecheck`, `npm run build`. At the last code verification, 20 tests, typecheck, and production build passed. Re-run after code changes.
- Secrets and case data: `.env`, `.env.local`, and `data/` are ignored. Never commit or print their contents. `.env.example` contains safe placeholders. A fresh clone needs its own credentials and synthetic sandbox records.

## Where the code lives

| Area | Files | Important behavior |
| --- | --- | --- |
| Case model and storage | `src/types/domain.ts`, `src/lib/db.ts` | A complete case is stored as JSON in local SQLite; transaction ID is unique, so repeated scans do not duplicate cases. |
| Workflow | `src/services/agent/orchestrator.ts` | `investigateCase` fetches records and requests the bill; `analyzeCase` waits, parses, and reconciles; `reviewCase` requires authorization; `notifyCase` creates the summary. Tool actions enter the audit log and timeline. |
| Bank and medical sources | `src/services/banking/`, `src/services/medical/`, `src/lib/providers.ts` | Interfaces select mocks in demo mode. Nessie and FinchNode read adapters exist but are not exposed through a live case workflow. |
| Billing and evidence | `src/services/communications/`, `src/services/reconciliation/` | The mock bill arrives as delayed plain text and is parsed. Reconciliation is deterministic. A missing clinical match means review, never proven error; price review remains unassessed without a trustworthy reference. |
| Optional AI wording | `src/services/agent/summary.ts` | OpenAI may rephrase structured synthetic case facts using a read-only facts tool. It does not choose actions, call providers, or change amounts. Without a key, a deterministic summary works. |
| UI and API | `src/components/`, `src/app/` | Dashboard, case timeline, bill evidence, authorization button, audit/communication activity, and demo reset. `/api/cases/[id]/analyze` returns 202 while the bill is pending. |
| Live-data guard | `src/proxy.ts` | `DEMO_MODE=false` blocks case and API routes. Do not remove this guard before identity, consent, protected storage, and live communication are implemented. |

## External integration state

**Nessie:** The configured key and HTTPS origin were tested. A synthetic customer, checking account, University Hospital merchant, and $4,820 purchase were created. Reading through customer → account → purchases → merchant returned the expected payment. Their IDs are saved only in this checkout's ignored `.env`. This is sandbox data, and the app still uses its mock transaction in demo mode. The bank and FinchNode synthetic records are not evidence of the same person's encounter.

**FinchNode:** The sandbox key and allowed categories were verified. Two synthetic `baseline-adult` Connect simulations were started using the [sandbox flow](https://finchnode.com/docs/get-started/quickstart); the most recent session ID is in `.env` as `FINCHNODE_CONNECT_SESSION`. On October 3, both remained in `syncing`, `GET /users` returned zero subjects, and `FINCHNODE_SUBJECT` was empty. Recheck the saved session's `simulation.state`; only set `FINCHNODE_SUBJECT` from a completed session's returned app-scoped `subject`. Do not use the public demo ID as an authenticated subject. The public synthetic API was used to correct normalization of encounter `type`, medications, labs, and reports. Claims are deliberately excluded as proof of care. The provided [sandbox controls page](https://finchnode.com/docs/testing/sandbox-controls) describes actions **after** a subject exists; it does not create one.

**Relay:** `relaymessenger@0.1.18-staging.1` is an exact, project-local dev dependency. Use `./node_modules/.bin/relay`. The staging agent handle is `medical_bill_guardian`; its Agent Token is stored only in ignored `.env` and the local CLI profile. There is no live `CommunicationProvider` adapter or provider/patient Relay handle yet. The documented [Relay API](https://docs.staging.relayapp.im/api-reference/overview) and [CLI](https://docs.staging.relayapp.im/cli/index) describe messaging and calls between Relay participants; ordinary hospital PSTN dialing has not been established. An attempt to make the agent private was rejected by automatic approval review because agent creation did not authorize changing who can start chats. Its default access policy remains; require explicit user authorization and an allowed-recipient scope before retrying that policy change. No medical data was sent through Relay.

## Resume priorities

1. Recheck the existing FinchNode Connect simulation and authenticated `/users` list. If it completed, save the returned subject locally and verify consent-filtered record reads; if still stalled, keep the demo on mocks and report the sandbox limitation accurately.
2. Implement a Relay communication adapter only after identifying a participating provider billing handle and an approved patient notification destination. Handle asynchronous responses and keep external review behind patient authorization.
3. Before connecting live cases, add user identity, bank-account ownership, patient consent, per-case authorization, protected storage, retention/deletion handling, and durable waiting/retry paths. Only then reconsider the `DEMO_MODE=false` guard.
4. For billing analysis, add real statement parsing and stronger encounter matching with claims/billing IDs. Do not invent national fair prices, infer fraud from missing records, or claim savings before provider confirmation.

The detailed checklist in `PROJECT_CHECKLIST.md` is the source of truth for remaining features. Keep documentation with each related code commit. The user prefers a simple implementation and a polished, reliable demo before broad API work.
