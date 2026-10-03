# Medical Bill Guardian checklist

Status as of 2026-10-03. Checked items are implemented in the repository; unchecked items remain to be built or verified. The app currently supports **synthetic demo data only**.

## Complete: working demo

- [x] Create a private GitHub repository with two initial, focused commits and a clean `main` branch.
- [x] Scaffold a Next.js, TypeScript web app with pinned dependencies, `.env.example`, README, and architecture notes.
- [x] Store cases in local SQLite with a unique transaction ID to prevent duplicate cases on repeated scans.
- [x] Define case, transaction, medical record, bill item, finding, communication, resolution, timeline, and audit types.
- [x] Detect likely healthcare purchases with deterministic merchant/category rules.
- [x] Provide mock bank, medical record, and communication adapters; demo mode makes no hospital, bank, or EHR calls.
- [x] Seed the University Hospital $4,820 payment, five supporting clinical records, and six itemized charges.
- [x] Match a payment to a nearby encounter using provider name and date.
- [x] Retrieve the mock bill, compare line items with available records, detect exact duplicate lines and total mismatches, and flag unsupported services for review.
- [x] Keep missing clinical evidence separate from a confirmed billing error; do not claim a market price without reference data.
- [x] Require the patient to click **Authorize billing review** before the mock provider review.
- [x] Record the mock provider's $700 correction and the resulting $4,120 total.
- [x] Generate an in-app case summary; optionally use OpenAI to rephrase structured case facts through a read-only tool.
- [x] Show a dashboard, case timeline, bill items, evidence, confidence, review action, resolution, and demo reset.
- [x] Log workflow steps and mock communications in each case.
- [x] Provide transaction, case, timeline, medical-record, communication, investigation, review, notification, and demo-reset API routes.
- [x] Block all case/API routes when `DEMO_MODE=false` until live-data safeguards exist.
- [x] Pass 16 automated tests, TypeScript checking, and a production build.

## Next: strengthen the demo

- [ ] Make the mock bill and mock provider response tell the same duplicate story. The current bill displays one $700 specialist line while the response says it was entered twice.
- [ ] Parse an actual itemized statement or structured provider payload instead of receiving prestructured mock bill items.
- [ ] Show separate bill-request and bill-received timeline events; support a bill that arrives later.
- [ ] Show the audit log and stored communication transcript in the case UI if judges need to inspect agent actions.
- [ ] Add a separate financial-review result when trustworthy reference data is available; keep clinical support and price review independent.
- [ ] Run a timed end-to-end demo and confirm the full story fits within two minutes.

## Next: live integrations and real patients

- [x] Obtain the Relay staging CLI/API documentation and identify its Agent Token, handles, messaging, calls, and webhook capabilities.
- [ ] Implement and test a Relay `CommunicationProvider` for a participating provider handle, and handle asynchronous billing responses. The documented call feature reaches a Relay chat participant; ordinary hospital phone dialing is not established.
- [ ] Connect and validate Nessie credentials, customer/account mapping, merchant data, and healthcare transaction detection against the chosen sandbox.
- [ ] Build the FinchNode patient Connect/consent flow, validate its live response shape, and normalize all relevant authorized record categories.
- [ ] Add patient identity, account ownership, consent records, and authorization checks for every case and consequential action.
- [ ] Replace local unencrypted case storage with protected per-patient storage and a retention/deletion policy before using real medical data. PostgreSQL/Prisma from the original proposal has not been implemented.
- [ ] Add durable jobs, retries, and `WAITING_FOR_BILL` / `WAITING_FOR_PROVIDER` resume paths so cases progress when external responses arrive later.
- [ ] Deliver real user notifications through an approved communication channel; the current notification is in-app only.
- [ ] Expand provider outcomes beyond the mock duplicate correction (verified charge, documentation supplied, adjustment, pending review, unresolved).
- [ ] Add stronger encounter matching with claims/billing identifiers when available, and calibrate evidence confidence on real data.
- [ ] Complete security, privacy, audit, and integration testing before removing the live-mode block or handling real patient information.

## Current scope decisions

- The app uses SQLite, not PostgreSQL/Prisma, to keep the local demo simple.
- The workflow uses deterministic state transitions; OpenAI currently helps with the final wording only. It does not plan or invoke external actions.
- No bank chargeback is initiated. Provider billing review comes first.
