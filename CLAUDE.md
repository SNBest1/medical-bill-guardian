@AGENTS.md

# Medical Bill Guardian — handoff (2026-10-04)

Read `AGENTS.md` for repository rules and architecture, then `README.md` for setup and the feature sections, and `PROJECT_CHECKLIST.md` for the task list. This file records the state of the work so the next session can resume without assuming the live integrations are finished.

## Goal and current result

A medical billing assistant that detects a hospital payment, obtains patient-authorized records and an itemized bill, checks each charge against clinical evidence, asks the patient before contacting billing, and explains the provider-confirmed outcome. **The demo is texting-first:** the patient talks to the agent over iMessage (Photon/Spectrum) and the website exists as a big live screen that shows the same case in real time. Live patient use is intentionally disabled (`DEMO_MODE=false` blocks all routes).

The judge patients are FinchNode's own synthetic patients, all seen at one hospital, **Northstar Health System**: Morgan Rivera (`patient-demo-001`, wellness visit, $1,102 bill, a $310 EKG with no record that the hospital removes → $792), Harriet Lindqvist (`patient-demo-polypharmacy`, $964, an unsupported $210 EKG the hospital verifies, no change), and Theo Abernathy (`patient-demo-pediatric-asthma`, $507, everything supported, nothing to ask). Itemized statements are generated from each patient's real FinchNode records (`node scripts/generate-statements.mjs`), not hand-written. The old Maya/Daniel/Priya stories and University Hospital case are gone (the `university-er` legacy fixture remains for tests).

## The text-driven flow

1. Patient texts "look into Morgan's bill" (name or condition word) → case starts, records are pulled from FinchNode's public demo API (saved-copy fallback is labelled as such).
2. With `PHOTON_UPDATE_TEXTS=true` the agent texts one fixed update per milestone (`src/services/agent/progress-updates.ts`): records found, bill requested, bill analyzed, hospital contacted, outcome, refund. Each is idempotent in the Photon outbox; an uncertain send is never resent; the sweep also runs from `/api/integrations/tick`.
3. The patient replies **YES** to authorize the paused hospital call or the billing review, **NO** to leave it paused, **STATUS** for the latest update (`yes Morgan` picks one when several wait). Classification is exact short phrases only (`patient-intent.ts`); execution is in `patient-decision.ts`, reuses `mutateCase`, and works only from `DEMO_PATIENT_PHONE`. Anything else is treated as a new request.
4. The hospital "texts" a PDF link; the bill is read live and reconciled. PDFs are hosted at `https://guardian-demo-bills.vercel.app/<name>.pdf` (root, no `/bills/`): `morgan-rivera-ns-71802`, `harriet-lindqvist-ns-58417`, `theo-abernathy-ns-33096`, plus the three older ones. `GUARDIAN_BILL_HOSTS` must list that host. Redeploying that Vercel project replaces the whole site, so re-include every PDF.

## Repository and run commands

- Private GitHub repo `git@github.com:SNBest1/medical-bill-guardian.git`, branch `main`. Regular, focused commits; docs ship with the code they describe.
- Stack: Next.js 16, React 19, TypeScript, SQLite. Start: `npm ci`, `cp .env.example .env`, `npm run dev` (port 3000), plus `node scripts/photon-receiver.mjs` for inbound texts. A second `next dev` cannot run in the same directory.
- Verify: `npm test`, `npm run typecheck`, `npm run build`. At last verification: 242 tests passed, typecheck clean (build not re-run).
- `.env`, `.env.local`, `data/` are ignored; never commit or print them. Needed text flags: `PHOTON_DEMO_TEXTS`, `PHOTON_REPLY_TEXTS`, `PHOTON_UPDATE_TEXTS` all `true`.

## Where the code lives

| Area | Files | Notes |
| --- | --- | --- |
| Case model/storage | `src/types/domain.ts`, `src/lib/db.ts` | JSON case in SQLite; Photon outbox/inbox tables give idempotent texts. |
| Workflow | `src/services/agent/orchestrator.ts`, `case-operation.ts` | `investigateCase` pauses at `REQUESTING_BILL` when a real call needs authorization; `mutateCase` is the per-case guard and triggers progress texts. |
| Text interface | `patient-command.ts`, `patient-intent.ts`, `patient-decision.ts`, `progress-updates.ts`, `communications/photon-*.ts` | Policy: approved patient phone only; fixed templates; replies never echo patient text. |
| Scenarios/records | `src/services/scenario-data.ts`, `scenario-statements.generated.ts`, `medical/finchnode-demo.ts`, `medical/record-source.ts` | Live pull from FinchNode demo API, encounter-window filter, honest source label. |
| Calls | `communications/fish-*.ts`, `docs/FISH_*PROMPT.md` | Fish places the bill-request call and the optional billing-review call; both need explicit authorization. |
| Bank | `src/services/banking/`, `scripts/nessie-seed.mjs` | Nessie sandbox discovery and a real sandbox refund transfer (fake money). |
| Live-data guard | `src/proxy.ts` | Keep until identity, consent, protected storage, and live communication exist. |

## External integration state

**FinchNode:** the stuck Connect-sandbox subject flow is no longer on the critical path. Records come from the keyless public demo API (`https://api.finchnode.com/demo/v1`), which serves fixed fictional patients; the sandbox cannot hold custom patients, so stories follow the fixed records. The authenticated-subject (`FINCHNODE_SUBJECT`) path and consent-filtered reads still exist for `DEMO_MODE=false` but were never completed; claims are excluded as proof of care.

**Nessie:** sandbox customers/accounts and the Northstar merchant are seeded per `node scripts/nessie-seed.mjs --apply`; IDs live only in `.env`.

**Relay:** `relaymessenger` CLI is pinned and the staging agent exists, but there is no Relay `CommunicationProvider`; Photon/Spectrum and Fish carry the demo instead. Never change who can start chats on the agent without explicit user approval.

**Photon/Spectrum and Fish:** all automated tests use fakes. Nothing in the text-approval or progress-update path has been run against live Spectrum or a live Fish call yet; verify with one end-to-end rehearsal.

## Open items

1. One live rehearsal: text → updates → YES (call) → hospital PDF link → YES (review) → outcome → refund.
2. Open PRs #1–#5 are teammates' parallel rewrites (SpacetimeDB/Vite, receipt-trace UI, Mihir's Fish `callers`). #1 and #4 conflict with `main`; the team must pick directions before merging. Do not close them.
3. Branch `feature/finchnode-patients` has newer unmerged commits from another session (live bill-request transcript, sandbox refund transfer); they merge cleanly into `main`.
4. Before any live use: identity, bank-account ownership, patient consent, per-case authorization, protected storage, retention/deletion, durable retry. Do not invent fair prices, infer fraud from missing records, or claim savings before provider confirmation.
5. Stray duplicate files named `* 2.ts(x)` are untracked in the working tree (macOS copies); ignore or delete them, do not commit them.
