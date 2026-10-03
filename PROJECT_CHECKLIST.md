# Medical Bill Guardian checklist

Status as of 2026-10-03. Checked items are implemented in the repository; unchecked items remain to be built or verified. The app currently supports **synthetic demo data only**.

## Complete: working demo

- [x] Create a private GitHub repository with two initial, focused commits and a clean `main` branch.
- [x] Scaffold a TypeScript web app with pinned dependencies, `.env.example`, README, and architecture notes (originally Next.js; now Vite + SpacetimeDB).
- [x] Store cases so repeated scans never duplicate them (originally SQLite with a unique transaction ID; now one case per owner and transaction in SpacetimeDB).
- [x] Define case, transaction, medical record, bill item, finding, communication, resolution, timeline, and audit types.
- [x] Detect likely healthcare purchases with deterministic merchant/category rules.
- [x] Provide mock bank, medical record, and communication adapters; demo mode makes no hospital, bank, or EHR calls.
- [x] Seed the University Hospital $4,820 payment, five supporting clinical records, and six itemized charges.
- [x] Match a payment to a nearby encounter using provider name and date.
- [x] Retrieve the mock bill, compare line items with available records, detect exact duplicate lines and total mismatches, and flag unsupported services for review.
- [x] Keep missing clinical evidence separate from a confirmed billing error; do not claim a market price without reference data.
- [x] Require the patient to click **Authorize billing review** before the mock provider review.
- [x] Record the mock provider's $700 correction and the resulting $4,120 total.
- [x] Generate a deterministic in-app case summary from verified case facts. (Optional OpenAI rephrasing was removed in the SpacetimeDB migration.)
- [x] Show a dashboard, case timeline, bill items, evidence, confidence, review action, resolution, and demo reset.
- [x] Log workflow steps and mock communications in each case.
- [x] Expose the workflow as SpacetimeDB reducers and per-owner views (replacing the earlier Next.js API routes).
- [x] Keep live data impossible until safeguards exist: the module contains only mock providers and makes no network calls (replacing the earlier `DEMO_MODE=false` route guard).
- [x] Pass automated tests, an end-to-end smoke test, TypeScript checking, and a production build.

## Next: strengthen the demo

- [x] Make the mock bill and provider response consistent: the specialist line duplicates services already included in the ER charge, as confirmed by the mock provider.
- [x] Parse the mock provider's plain-text statement instead of receiving prestructured bill items. Real provider documents still need a separate parser.
- [x] Show separate bill-request and bill-received timeline events and resume a case after a delayed mock bill arrives.
- [x] Show the audit log and stored communication transcript in the case UI.
- [x] Show clinical evidence and financial review separately; price review remains **not assessed** until a trustworthy reference source is connected.
- [x] Run the complete synthetic flow through the API in 1.1 seconds and through the UI in 19 seconds, within the two-minute demo target.

## Complete: SpacetimeDB migration (hackathon track)

- [x] Move the backend into a SpacetimeDB TypeScript module: private tables, case state machine in reducers, per-owner views.
- [x] Deliver the mock bill from a scheduled reducer so every open tab updates live, with no polling; only the scheduler can run it.
- [x] Store money as integer cents and keep billing logic pure and unit-tested in `spacetimedb/src/logic/`.
- [x] Replace Next.js with a Vite React client that subscribes to the views; generated bindings are committed.
- [x] Add `npm run smoke`: full story, stranger isolation, scheduler-only guard, and reset removing a pending delivery.
- [ ] Publish the module to Maincloud and deploy the frontend to Cloudflare Workers.

## Next: live integrations and real patients

- [x] Obtain the Relay staging CLI/API documentation and identify its Agent Token, handles, messaging, calls, and webhook capabilities.
- [x] Install the Relay CLI as an exact, project-local dependency and create the staging `medical_bill_guardian` agent without committing its token.
- [ ] Implement and test a Relay `CommunicationProvider` for a participating provider handle, and handle asynchronous billing responses. The documented call feature reaches a Relay chat participant; ordinary hospital phone dialing is not established.
- [x] Validate Nessie sandbox credentials and create one synthetic customer, checking account, University Hospital merchant, and $4,820 purchase. Confirm the account/purchase/merchant read path used by the adapter; IDs stay in the ignored `.env`.
- [ ] Connect the synthetic Nessie purchase to a case through a protected, authenticated live workflow; the current app deliberately blocks live case routes.
- [x] Validate the FinchNode sandbox key and app categories, attempt synthetic Connect sessions, and test normalized record field mapping against FinchNode's public synthetic API.
- [ ] Complete a FinchNode sandbox Connect simulation and save its app-scoped subject. Two sessions remain in `syncing` with no subject exposed by `GET /users`; retry after the sandbox service completes them.
- [ ] Build the FinchNode patient Connect/consent flow, validate its live response shape, and normalize all relevant authorized record categories.
- [ ] Add patient identity, account ownership, consent records, and authorization checks for every case and consequential action.
- [ ] Add real authentication, encryption, and a retention/deletion policy before using real medical data. Per-owner views isolate demo cases by SpacetimeDB identity, but anonymous identities are not patient authentication. PostgreSQL/Prisma from the original proposal will not be used.
- [ ] Add durable jobs, retries, and `WAITING_FOR_BILL` / `WAITING_FOR_PROVIDER` resume paths so cases progress when external responses arrive later.
- [ ] Deliver real user notifications through an approved communication channel; the current notification is in-app only.
- [ ] Expand provider outcomes beyond the mock duplicate correction (verified charge, documentation supplied, adjustment, pending review, unresolved).
- [ ] Add stronger encounter matching with claims/billing identifiers when available, and calibrate evidence confidence on real data.
- [ ] Parse real provider statements or attachments and add a trustworthy financial reference source before making price claims.
- [ ] Complete security, privacy, audit, and integration testing before adding any live integration or handling real patient information.

## Current scope decisions

- The backend is SpacetimeDB (hackathon track), not PostgreSQL/Prisma or SQLite.
- The workflow uses deterministic state transitions in reducers. No language model plans, acts, or writes the summary.
- No bank chargeback is initiated. Provider billing review comes first.
