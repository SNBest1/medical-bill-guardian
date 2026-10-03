<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Medical Bill Guardian architecture

`src/types/domain.ts` defines the persisted case shape. `src/lib/db.ts` stores a complete case JSON value in SQLite with a unique transaction ID, so scanning is idempotent. The database lives in ignored `data/`; use synthetic records only because the app has no authentication or encrypted storage.

`src/services/agent/orchestrator.ts` owns the state transitions. `investigateCase` obtains records and an itemized bill and stops at `REVIEW_REQUIRED`; `reviewCase` requires explicit authorization before provider contact; `notifyCase` builds the result. Its audit log records controlled tool steps. `src/services/reconciliation/reconcile.ts` is deterministic and keeps missing evidence distinct from a confirmed billing error. AI text generation in `summary.ts` may only rephrase structured case facts; it cannot call provider APIs.

`src/services/banking`, `medical`, and `communications` each define provider boundaries. `src/lib/providers.ts` selects mocks by default. In live mode the communication provider intentionally refuses to run until a real Relay or Photon contract is implemented. FinchNode requires a consented subject. The mock provider never contacts a hospital.

`src/proxy.ts` blocks all API and case routes when `DEMO_MODE=false`; remove this guard only after implementing user identity, per-patient consent, encrypted storage, and the live communication adapter.

`src/app/api` contains the route handlers; `src/components/Dashboard.tsx` and `CaseView.tsx` present the demo. Next.js runs on port 3000. Start with `npm ci`, `cp .env.example .env.local`, `npm run dev`. Verify with `npm test`, `npm run typecheck`, `npm run build`. Keep `.env.local` and `data/` out of Git.
