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

- [x] Make the mock bill and provider response consistent: the specialist line duplicates services already included in the ER charge, as confirmed by the mock provider.
- [x] Parse the mock provider's plain-text statement instead of receiving prestructured bill items. Real provider documents still need a separate parser.
- [x] Show separate bill-request and bill-received timeline events and resume a case after a delayed mock bill arrives.
- [x] Show the audit log and stored communication transcript in the case UI.
- [x] Show clinical evidence and financial review separately; price review remains **not assessed** until a trustworthy reference source is connected.
- [x] Run the complete synthetic flow through the API in 1.1 seconds and through the UI in 19 seconds, within the two-minute demo target.

## Next: live integrations and real patients

- [ ] Before enabling real patient data or hospital calls, review HIPAA applicability and the patient-directed advocacy model with qualified privacy counsel; do not describe the prototype as HIPAA compliant.
- [ ] Implement hospital-accepted patient disclosure authorization separately from FinchNode consent, including scope, expiration, revocation, identity verification, and separate approval for settlements or dispute submission.
- [ ] Review voice/AI, messaging, upload, and storage vendors for appropriate data handling and any required business associate agreements; address call recording consent requirements before recording real calls.
- [ ] Keep the voice centerpiece synthetic and clearly disclose the simulated hospital representative; provide patient takeover or patient-upload fallback when a real hospital cannot accept agent authorization. Use authenticated secure uploads for real statements rather than unverified chat or SMS delivery.
- [x] Obtain the Relay staging CLI/API documentation and identify its Agent Token, handles, messaging, calls, and webhook capabilities.
- [x] Install the Relay CLI as an exact, project-local dependency and create the staging `medical_bill_guardian` agent without committing its token.
- [x] Fish Audio outbound call behind an explicit authorization step (destination locked to `FISH_TEST_TO_NUMBER` = `DEMO_HOSPITAL_PHONE`, per-call dynamic variables, idempotency key); unit-tested with a fake fetch.
- [ ] Run one live Fish call end to end (publish the agent from `docs/FISH_AGENT_PROMPT.md`, set the four `FISH_*` values, authorize on the case page, text the PDF link back); no live Fish request has been made yet.
- [ ] Implement and test a Relay `CommunicationProvider` for a participating provider handle, and handle asynchronous billing responses. The documented call feature reaches a Relay chat participant; ordinary hospital phone dialing is not established.
- [x] Validate Nessie sandbox credentials and create one synthetic customer, checking account, University Hospital merchant, and $4,820 purchase. Confirm the account/purchase/merchant read path used by the adapter; IDs stay in the ignored `.env`.
- [ ] Connect the synthetic Nessie purchase to a case through a protected, authenticated live workflow; the current app deliberately blocks live case routes.
- [x] Validate the FinchNode sandbox key and app categories, attempt synthetic Connect sessions, and test normalized record field mapping against FinchNode's public synthetic API.
- [ ] Complete a FinchNode sandbox Connect simulation and save its app-scoped subject. A third, freshly created session also stuck in `simulation.state: "syncing"` with `subject: null` even though its one-time sync completed — confirmed sandbox-side limitation, not a polling bug. Use `scripts/finchnode-start-session.mjs` / `scripts/finchnode-resolve-session.mjs` to retry; see `docs/FINCHNODE_HANDOFF.md`.
- [x] Normalize FinchNode's authorized record categories (encounters, medications, labs, diagnostic reports, documents) and restrict returned evidence to records matching the paid provider and a pre-payment date window, so an unrelated sandbox record can never attach to the demo payment. Live end-to-end validation is still blocked on the subject above.
- [ ] Add patient identity, account ownership, consent records, and authorization checks for every case and consequential action.
- [ ] Replace local unencrypted case storage with protected per-patient storage and a retention/deletion policy before using real medical data. PostgreSQL/Prisma from the original proposal has not been implemented.
- [ ] Add durable jobs, retries, and `WAITING_FOR_BILL` / `WAITING_FOR_PROVIDER` resume paths so cases progress when external responses arrive later.
- [ ] Deliver real user notifications through an approved communication channel; the current notification is in-app only.
- [ ] Expand provider outcomes beyond the mock duplicate correction (verified charge, documentation supplied, adjustment, pending review, unresolved).
- [ ] Add stronger encounter matching with claims/billing identifiers when available, and calibrate evidence confidence on real data.
- [ ] Parse real provider statements or attachments and add a trustworthy financial reference source before making price claims.
- [ ] Complete security, privacy, audit, and integration testing before removing the live-mode block or handling real patient information.

## Voice and refund implementation (Desktop checkout)

- [x] Add two rehearsable fictional conversations: request the statement, then challenge the specialist charge; browser speech, transcript, replay, cancellation, and wrap-up controls are implemented.
- [x] Require explicit authorization at the bill-collection API boundary as well as the billing-review boundary.
- [x] Add a demo-only plain-text statement inbox with provider matching and manual-delivery rehearsal mode.
- [x] Keep a provider-approved refund pending until a separately matched synthetic credit; reject duplicate credits and corrections that do not reconcile with the bill.
- [x] Add optional sourced price-reference matching with provider, procedure code, validity dates, basis, and source attribution. No fabricated prices are bundled.
- [ ] Verify audible browser playback, layout, and the four-minute rehearsal; browser automation was blocked by unavailable policy verification.
- [ ] Supply curated, comparable reference rates for the demo procedures; most current fixture items have no procedure code.
- [ ] Connect the Nessie detection event to a consented agent job rather than only opening a case; implement provider-specific hospital verification and polling if no native webhook exists.
- [x] Verify Stable Photon project access through Node and register the two user-approved shared-line demo recipients; routing IDs stay in ignored `.env.local`. SIP voice transport is still pending.
- [ ] Implement signed, durable inbound messaging and outbound notifications; the current inbox and notifications are local simulations.
- [ ] Implement an actual voice transport and audio agent, written external refund confirmation, bank-credit verification, and authorized dispute submission. Browser speech does not dial a provider.

## Current scope decisions

- The app uses SQLite, not PostgreSQL/Prisma, to keep the local demo simple.
- The workflow uses deterministic state transitions; OpenAI currently helps with the final wording only. It does not plan or invoke external actions.
- No bank chargeback is initiated. Provider billing review comes first.

## Insurance and source-backed pricing update

- [x] Preserve statement patient responsibility and insurance adjustments separately from gross charges.
- [x] Add final-EOB reconciliation, pending/missing-information states, payer/plan-aware rate matching, and billing-context checks.
- [x] Require insurance reprocessing after an insured gross-charge correction; never promise the gross correction as the patient's refund.
- [x] Import 1,080 published cash/negotiated snapshot rows for four selected codes, with provenance and methodology; expose a reference catalog without assigning these to fictional services or assuming current contract validity.
- [ ] Validate actual service codes, billing units/modifiers, provider identity, setting/component, payer/plan, and date applicability before converting public snapshot rows into exact comparison references.
- [ ] Complete revised-EOB intake and bank-credit allocation tracking for an insured refund; noncovered services, balance billing, financial assistance, bundles, and special benefit rules still require review.

## Text-to-agent command

- [x] Accept a patient iMessage command only from `DEMO_PATIENT_PHONE` (DM, iMessage, plain text, 500 characters or fewer), reusing the web command resolver through a shared `runAgentCommand` service; dedupe by message ID in SQLite; record `PHOTON_COMMAND` in the audit log without the phone number.
- [x] Optional one-time fixed reply to the patient phone behind `PHOTON_REPLY_TEXTS` (off by default), through the Photon outbox idempotency.
- [ ] Exercise the patient-command path and reply against live Spectrum (unit-tested with fakes only).

## Staged call and texted bill PDF

- [x] Judge scenarios are FinchNode's real synthetic patients (Morgan Rivera, Harriet Lindqvist, Theo Abernathy). Records are pulled live from the keyless public demo API at investigation time (8 s timeout, one retry), kept to the encounter window (service date +/- 1 day, same organization), and labeled live or "FinchNode unreachable - using the saved copy" (fixtures in `src/services/medical/fixtures/`). Bills are generated from the pulled records (`scripts/generate-statements.mjs`). Records panel shows counts per category. The original University Hospital case keeps the "no live FinchNode call" scenario adapter.
- [x] Hospital bill-link text policy (`evaluateHospitalBillLink`), SSRF-safe PDF fetch (`GUARDIAN_BILL_HOSTS` allowlist, redirect/IP/size/time/content limits), message-ID dedupe in `bill_link_inbox`.
- [x] PDF text extraction (`unpdf@1.8.1`, exact pin) and tolerant bill parser with sum/date/provider validation; shared `receiveParsedBill` path with the plain-text statement.
- [x] Live `case.reading` steps (one per real operation and per charge) and unmatched/ambiguous/rejected handling without state change.
- [x] "Calling hospital billing" waiting screen, "Reading the bill" live panel, phone-width layout, reduced-motion support.
- [x] ElevenLabs staged-call prompts for the three scenarios (docs/ELEVENLABS_AGENT_PROMPTS.md).
- [x] Bill-link matching tells the three same-hospital patients apart by the PDF's patient name, then invoice number, and fails visibly when still ambiguous.
- [ ] Set `DEMO_HOSPITAL_PHONE` and restart the app and receiver, then exercise the link path against live Spectrum/iMessage (verified only with fakes and a local fake PDF server).
- [ ] Host the three new PDFs (`morgan-rivera-ns-71802.pdf`, `harriet-lindqvist-ns-58417.pdf`, `theo-abernathy-ns-33096.pdf`) at the allowlisted host and set `GUARDIAN_BILL_HOSTS` to match.
- [ ] Seed the three new patients into Nessie (`node scripts/nessie-seed.mjs --apply`; dry run reviewed, not applied). Earlier seeded entries for the old accident scenarios are ignored.
- [ ] Cost review of the generated chargemaster-style prices is a later phase; the amounts are fictional.
- [ ] Bill links are accepted only from the local receiver; the public signed webhook still accepts only the exact-grammar statement.
- [ ] OCR for scanned PDFs (only the PDF text layer is read today).

