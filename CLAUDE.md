@AGENTS.md

# Medical Bill Guardian — handoff (2026-10-03)

Read `AGENTS.md` for architecture and rules, `README.md` for setup, and `PROJECT_CHECKLIST.md` for remaining work. The design and plan for the SpacetimeDB migration are in `docs/superpowers/specs/2026-10-03-spacetimedb-backend-design.md` and `docs/superpowers/plans/2026-10-03-spacetimedb-backend.md`.

## Goal and current result

The project is entered in a SpacetimeDB hackathon track, so SpacetimeDB must visibly run the demo: it holds the case state machine and pushes live updates. The complete synthetic demo works end to end on a local SpacetimeDB server. Live patient use is impossible by construction: the module has only mock providers.

Demo story: University Hospital, September 28, 2026, $4,820 payment, six charges. Five match mock records. The $700 specialist consultation has no clinical match, so the case asks the patient before contacting billing. After authorization, the mock hospital confirms it duplicated services in the ER charge; the corrected total is $4,120.

## Non-obvious decisions and why

| Decision | Why |
| --- | --- |
| Case split across tables, not one JSON row | SpacetimeDB syncs row by row; each new timeline row appears live in the UI. |
| `owner` denormalized and indexed on every child table | Each view is one indexed filter on `ctx.sender`, no joins. |
| Uniqueness per (owner, transaction), checked in `scan_demo_payment` | Every judge gets their own demo case; a global unique key would give it only to the first visitor. |
| Status-like columns are `t.string()`, not `t.enum` | 2.10 enums are tagged unions (`{ tag: "DETECTED" }`) that the UI would have to unwrap everywhere. Module code writes them only through the `CaseStatus`/`ClinicalStatus` unions; `assembleCases` casts once. |
| Integer cents | The bill total check is exact equality; no float rounding. |
| Bill arrives from a scheduled reducer | Replaces the old 202/polling loop; the arrival is the live-update moment of the demo. |
| `deliver_bill` checks `ctx.sender.equals(ctx.databaseIdentity)` | Scheduled reducers are otherwise callable by clients. Identities compare with `.equals`, never `===`. |
| Navigation is component state, no router | A single dashboard/case switch did not justify a dependency. A restart returns to the dashboard because the new case has a new id. |
| OpenAI summary rephrasing removed | Modules have no environment variables; storing a key was not worth it for wording. The deterministic summary is the only summary. |

## Commands and ports

- Local SpacetimeDB: `spacetime start` (port 3000). Vite dev server: `npm run dev` (port 5173). Smoke test: own server on port 3100.
- After changing `spacetimedb/src/schema.ts` or `index.ts`: republish (`spacetime publish -s local --module-path spacetimedb medical-bill-guardian`; incompatible schema changes need `--delete-data`, fine because data is synthetic) and run `npm run spacetime:generate`.
- Verify: `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
- Secrets: `.env`, `.env.local`, and `data/` are ignored. Never commit or print them.

## External integration state

Unchanged by the migration and not wired into the app. **Nessie:** a synthetic customer, account, University Hospital merchant, and $4,820 purchase were created and read back; IDs are only in `.env`. **FinchNode:** the sandbox key works, but both synthetic Connect sessions stayed in `syncing` and `GET /users` returned no subject as of 2026-10-03; only set `FINCHNODE_SUBJECT` from a completed session. **Relay:** staging agent `medical_bill_guardian` exists; no adapter, and no provider or patient handle yet. An attempt to make the agent private was rejected; retry only with explicit user authorization and an allowed-recipient scope.

## Resume priorities

1. Publish the module to Maincloud and deploy the frontend to Cloudflare (plan Task 5); each needs the user's explicit yes. `spacetime.json` defaults to the `local` server so a bare `spacetime publish` never reaches Maincloud — pass `-s maincloud` explicitly when publishing.
2. Recheck the FinchNode Connect simulation; keep the demo on mocks if it is still stalled.
3. Before any live data: identity, consent, protected storage, retention/deletion, and a live communication adapter (likely a SpacetimeDB procedure, which can make HTTP calls).
4. Real statement parsing and stronger encounter matching; never invent fair prices or claim savings before provider confirmation.
