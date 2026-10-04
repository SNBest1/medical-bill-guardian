<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Medical Bill Guardian architecture

`src/types/domain.ts` defines the persisted case shape. `src/lib/db.ts` stores a complete case JSON value in SQLite with a unique transaction ID, so scanning is idempotent. The database lives in ignored `data/`; use synthetic records only because the app has no authentication or encrypted storage.

`src/services/agent/orchestrator.ts` owns the state transitions. `investigateCase` obtains records and requests an itemized bill, then stops at `WAITING_FOR_BILL`; `analyzeCase` polls for a plain-text statement, parses it, and stops at `REVIEW_REQUIRED` when evidence is missing. `reviewCase` requires explicit authorization before provider contact; `notifyCase` builds the result. Its audit log records controlled tool steps. `src/services/communications/parse-bill.ts` parses the synthetic statement. `src/services/reconciliation/reconcile.ts` is deterministic and keeps missing evidence distinct from a confirmed billing error. AI text generation in `summary.ts` may only rephrase structured case facts; it cannot call provider APIs.

The three judge scenarios (`morgan-wellness`, `harriet-kidney`, `theo-asthma` in `src/services/scenario-data.ts`) are FinchNode's own public demo patients, all seen at "Northstar Health System", so a hospital name never identifies a patient: pass the case's scenario ID (`scenarioIdOf` in the orchestrator). In demo mode `DemoMedicalProvider` (`src/services/medical/finchnode-demo.ts`) makes a real keyless GET to `https://api.finchnode.com/demo/v1/users/{subject}/records`, keeps only the encounter window (service date +/- 1 day, same organization), and records on the case whether the pull was live or the labeled saved-copy fallback (`src/services/medical/fixtures/`); never describe a fallback as live. Itemized statements are generated from those records (`src/services/billing/recipes.ts`, `scripts/generate-statements.mjs`, output in `src/services/scenario-statements.generated.ts`), and tests must not use the network.

`src/services/banking`, `medical`, and `communications` each define provider boundaries. `src/lib/providers.ts` selects mocks by default. Relay staging API documentation is linked in README, but a live adapter is not yet implemented; the communication provider still refuses to run in live mode. Relay's documented calls are between chat participants, so do not assume PSTN hospital dialing. FinchNode requires a consented subject. The mock provider never contacts a hospital.

The Nessie sandbox customer/account/merchant/purchase IDs are saved only in this checkout's ignored `.env`. FinchNode has no authenticated subject yet: two synthetic Connect simulations remain in `syncing`, and `GET /users` returns no subjects. `src/services/medical/finchnode.ts` maps FinchNode's normalized encounter `type`, medication, lab, report, and document fields to evidence; it intentionally excludes claims from clinical proof. Do not link the separate sandbox records to the mock University Hospital encounter without matching evidence.

The Relay CLI is pinned in `devDependencies` and runs from `./node_modules/.bin/relay`. The staging agent handle is `medical_bill_guardian`. Its token belongs only in the ignored `.env` or Relay's local private profile; never print or commit it. Agent access policy changes need explicit approval before changing who can start chats.

`src/proxy.ts` blocks all API and case routes when `DEMO_MODE=false`; remove this guard only after implementing user identity, per-patient consent, encrypted storage, and the live communication adapter.

`src/app/api` contains the route handlers; `src/components/Dashboard.tsx` and `CaseView.tsx` present the demo. Next.js runs on port 3000. Start with `npm ci`, `cp .env.example .env`, `npm run dev`. Verify with `npm test`, `npm run typecheck`, `npm run build`. Keep `.env`, `.env.local`, and `data/` out of Git.
