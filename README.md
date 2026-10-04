# Medical Bill Guardian

Medical Bill Guardian is a local-first hackathon web app that opens a case when a healthcare payment appears, compares an itemized bill with available medical evidence, and asks the patient before contacting billing. Its built-in demo completes the University Hospital story with no hospital, bank, or medical-record API calls.

## Architecture

```text
Nessie / mock bank → transaction scan → SQLite MedicalBillCase
                                          ↓
                  FinchNode / mock records + Relay/Photon / mock bill
                                          ↓
                 deterministic reconciliation → review authorization
                                          ↓
                  provider response → summary → in-app notification
```

Next.js route handlers own case transitions and persistence. Provider interfaces keep the bank, medical-record, and communications sources replaceable. The reconciliation engine decides evidence status from structured data; an optional OpenAI Responses call can rephrase a verified result through one read-only `get_case_facts` tool. The model cannot invoke provider APIs or change financial outcomes.

SQLite stores case JSON, timeline events, audit entries, and communication outcomes in `data/guardian.sqlite`. The `data/` directory is ignored by Git because cases can contain medical information. There is no user authentication or encryption layer; use synthetic data only.

## Quick start

Requires Node.js 22 or later.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Demo mode is on by default and scans the seeded payment when the dashboard loads. Open the University Hospital case and click **Authorize & request bill**, then **Play voice demo**. Browser speech plays the Guardian and fictional billing representative; no hospital is dialed. Complete the script (or use **Wrap up script**) and click **Save demo outcome** to request the statement. The mock provider delivers plain text after a short delay; the case parses it and compares six charges with the available records. Inspect the $700 specialist item, then click **Authorize billing review** and play the second scripted conversation. Saving its outcome records the provider-confirmed duplicate correction and $4,120 corrected total. Because the original $4,820 was already paid, the app shows a **$700 demo refund pending**, not a second payment. **Simulate matching refund credit** records a synthetic credit without moving real money. Expand **Activity and communications** to inspect tool steps and scripted exchanges. Repeating a scan returns the same case because transaction IDs are unique.

Audio availability and voice quality depend on the browser. **Next turn**, **Wrap up script**, replay, and cancellation provide a transcript fallback. Browser playback has not yet been visually or audibly verified in this checkout. These calls are simulations, not a live voice integration.

For a manual bill-receipt rehearsal, set `DEMO_BILL_DELIVERY=manual`, restart the server, request the statement, and use **Demo statement inbox** to paste the exact fictional statement. `POST /api/cases/:id/statement` accepts plain text only in demo mode; it is not an authenticated external webhook. `POST /api/cases/:id/run` now requires `{ "authorized": true }` for bill collection.

Price comparison can read a curated `data/pricing-references.json` array. Each entry requires `code`, `provider`, `referenceAmount`, `sourceName`, `sourceUrl` (HTTPS), `basis` (`CASH`, `NEGOTIATED`, or `MEDICARE`), `asOf`, `validFrom`, and `validThrough`. Dates use `YYYY-MM-DD`. Only a unique matching provider/procedure code with an applicable service date is compared. A billed amount at least twice the reference is a review lead, not a proven billing error. No reference prices are bundled; missing codes, ambiguous references, and missing or stale rates remain **not assessed**. Verify comparable units, setting, and rate basis when curating data.

Photon Spectrum credentials may be stored in ignored `.env.local` (which takes precedence over `.env`). Spectrum messaging and SIP calls are not enabled by merely adding credentials. The reviewed Stable voice contract requires a project iMessage line and a SIP application; inbound text requires authenticated webhook handling. Do not send messages or calls until demo destinations are explicitly approved. Real patient use remains blocked.

Use **Restart demo** below a completed case summary to replay the case from payment detection.

Run checks with `npm test`, `npm run typecheck`, and `npm run build`.

## Demo safety and scope

- A missing clinical match means **needs review**. It never proves the charge is invalid or fraudulent.
- The $700 correction is shown only after the mock hospital response confirms it. Price benchmarking is deliberately not claimed.
- The authorization button is required before the mock billing review. No bank chargeback is initiated.
- `DEMO_MODE=true` makes zero external bank, EHR, or hospital calls. If `OPENAI_API_KEY` is set, only structured synthetic case facts are sent to OpenAI for the optional summary; omit the key to keep the entire demo offline.
- `DEMO_MODE=false` blocks all case and API routes until user identity, patient consent, encrypted storage, and a live communication adapter are implemented. Nessie and FinchNode adapter code is present for later integration, but the app does not expose real patient data in this state.

## Integration configuration

Copy `.env.example` to `.env` for local configuration; both `.env` and `.env.local` are ignored by Git. Nessie needs a sandbox API key, customer ID, and its HTTPS API origin. The adapter reads account purchases and resolves merchant IDs to merchant names. FinchNode needs a server-side API key and a subject from a completed patient Connect consent flow; it uses the [consent-filtered records endpoint](https://finchnode.com/products/records-api). The [Relay staging API](https://docs.staging.relayapp.im/api-reference/overview) uses a server-side Agent Token and Relay handles. Its documented calls reach people in Relay chats, so a participating provider handle is needed; this does not establish ordinary hospital phone dialing. The Relay adapter has not been implemented or enabled. No credential belongs in source control.

The Relay CLI is pinned as a project-local development dependency. After `npm ci`, use `./node_modules/.bin/relay --help`. A staging agent named `medical_bill_guardian` was created through this CLI; its token is stored only in the ignored local `.env` and Relay's private CLI profile. Agent creation alone does not send messages or enable live mode.

For this checkout, a synthetic Nessie customer, account, University Hospital merchant, and $4,820 purchase have been created and verified through the sandbox read endpoints. Their IDs and key remain in the ignored local `.env`; a fresh clone must supply its own sandbox credentials and records. The FinchNode sandbox key was validated, but its synthetic Connect sessions are still reporting `syncing` and have not issued an app-scoped subject. The public FinchNode demo record was used only to validate the adapter's normalized field mapping. These separate synthetic sources do not establish that the FinchNode patient had the University Hospital visit shown in the local mock story.

## API

`GET /api/transactions`, `POST /api/transactions/scan`, `GET|POST /api/cases`, `GET /api/cases/:id`, `POST /api/cases/:id/run`, `POST /api/cases/:id/analyze`, `POST /api/cases/:id/request-review`, `POST /api/cases/:id/notify`, and read-only medical-record, communication, and timeline routes under `/api/cases/:id/`. `analyze` returns `202` while the requested statement is pending.

## Insurance-aware review and public rate catalog

The synthetic case starts explicitly as self-pay; it is not an assertion about either demo participant's insurance. After statement analysis, **Add synthetic insurance / EOB data** can demonstrate an insured case. `POST /api/cases/:id/insurance` accepts coverage, network, claim status, payer/plan, and a matching final EOB. The financial review checks gross charges, contractual adjustments, allowed amount, insurer/secondary payments, deductible, copay, coinsurance, noncovered charges, and patient responsibility. Pending claims, missing information, mismatched invoices/dates, and inconsistent allocations do not produce an exact balance. Actual EOB allocations reflect benefit limits and accumulators; this app does not independently adjudicate coverage, out-of-network protections, bundling, denials, or coordination of benefits.

An insured gross-charge correction now requests insurance reprocessing. It does **not** promise a refund equal to the removed gross charge. A revised EOB and provider patient balance are needed before a patient refund is established.

`reference-data/michigan-medicine-selected-rates.json` contains 1,080 public cash/negotiated rate records for selected codes from University of Michigan Health's published CSV snapshot. The source URL, metadata, ZIP hash, component, setting, payer/plan, methodology, and notes are preserved. `scripts/import-hospital-prices.py --zip /path/to/download.zip` reproduces the extraction. **Published price reference database** and `GET /api/pricing/reference?code=99285&basis=CASH` expose these as contextual evidence. They are kept separate from the fictional University Hospital case and never treated as exact out-of-pocket amounts. No current-contract validity end date or billing units are invented.

For exact comparisons, curated `data/pricing-references.json` rows additionally require units, setting, component, and modifiers. An insured comparison requires an in-network rate matching the exact payer and plan; cash and Medicare rates are not substituted. A row with different or missing context cannot establish the patient's contractual obligation. Most demo items still lack sufficient procedure specificity for an exact comparison.

Approved demo hospital/patient phone destinations and Photon shared-line routing IDs are stored only in ignored `.env.local`. Stable Spectrum project credentials work through Node's HTTP client; earlier Python HTTP requests returned 403. Recipient registration does not itself enable SIP voice transport, send a notification, or place a call. FinchNode integration remains a separate workstream.

### Real outbound call through Fish Audio (optional)

When `FISH_API_KEY`, `FISH_AGENT_ID`, `FISH_PHONE_NUMBER_ID`, and `FISH_TEST_TO_NUMBER` are all set (and `DEMO_MODE` is not `false`), the case pauses at `REQUESTING_BILL` after records are retrieved. The case page shows **Authorize hospital call** with the call brief, the masked destination, and a note that a real phone rings. Pressing it sends `POST /api/cases/:id/request-bill {"authorized":true}`, which places one call, records the Fish session ID on a pending request, and moves to the usual waiting screen; the hospital then texts the PDF link as before. Without the four values the mock flow is unchanged.

Safety: the destination comes only from `FISH_TEST_TO_NUMBER`, must be valid E.164, and must equal `DEMO_HOSPITAL_PHONE`; it is never accepted from the browser, a request, or case data. Numbers are masked to the last four digits and keys never leave the server. The body sent to Fish is `agent_id`, `phone_number_id`, `to_number`, and `dynamic_variables` (`patient_name`, `hospital_name`, `payment_amount`, `payment_date`, `service_date`, `guardian_line`, `guardian_line_spoken`), plus an `Idempotency-Key` so a retry cannot place a second call. `SPECTRUM_HOSPITAL_ASSIGNED_LINE` is the number the hospital is asked to text. Agent prompt and variable table: [docs/FISH_AGENT_PROMPT.md](docs/FISH_AGENT_PROMPT.md). Tests use a fake `fetch`; nothing was run against live Fish.

### Text the agent (Photon patient command)

With the app running, `node scripts/photon-receiver.mjs` holds a receive-only Spectrum connection and forwards inbound iMessages to `/api/integrations/photon/local-intake` using the worker bearer token. A DM from exactly `DEMO_PATIENT_PHONE` (plain text, 500 characters or fewer) such as "investigate Maya's hospital bill" starts that patient's investigation, the same as the web command box. It authorizes record and itemized-bill collection only; contacting hospital billing still needs its own approval. Texts from any other sender, group chats, attachments, and unclear or ambiguous requests start nothing. Hospital statement texts (`DEMO_HOSPITAL_PHONE`) work as before. Redelivered message IDs are ignored.

Environment variables (names only): `GUARDIAN_WORKER_TOKEN` (authenticates the receiver), `GUARDIAN_LOCAL_URL`, `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `DEMO_PATIENT_PHONE`, `DEMO_HOSPITAL_PHONE`. The confirmation reply is opt-in: set `PHOTON_REPLY_TEXTS=true` (and `PHOTON_DEMO_TEXTS=true`) to send one fixed iMessage to `DEMO_PATIENT_PHONE` only, such as "On it - investigating Maya's hospital bill." or "Which bill: Maya or Daniel?". The reply is sent by the app, not the receiver, and never echoes the patient's text. Automated tests use fakes; this path has not been exercised against live Spectrum.

### Hospital texts the bill PDF (staged call)

In the staged demo a person plays hospital billing on a voice call (prompts in [docs/ELEVENLABS_AGENT_PROMPTS.md](docs/ELEVENLABS_AGENT_PROMPTS.md); the app places no call). Set `DEMO_BILL_DELIVERY=manual` so the mock provider never auto-delivers. The case page then shows a "Calling hospital billing" waiting screen. The "hospital" texts a link to the itemized-bill PDF from `DEMO_HOSPITAL_PHONE` to the agent's line (DM, iMessage, plain text, 2000 characters or fewer, first URL only, path ending in `.pdf`). The app acknowledges at once, then in the background: verifies the host, downloads the PDF, extracts its text (`unpdf`), parses the bill, matches it to the single case waiting for a bill from that provider (and patient), checks each charge against the retrieved records, and hands the parsed bill to the same analysis the plain-text statement uses. Each real step is saved to `case.reading` and streams onto the case page; a short pause (`GUARDIAN_READING_PACE_MS`, default 450) between per-charge steps is presentation pacing only.

Safe fetch: only https (plain http to a loopback host only when `GUARDIAN_BILL_ALLOW_LOCALHOST=true` or under tests), the host must be listed in `GUARDIAN_BILL_HOSTS` (comma-separated, exact match; empty rejects everything), no credentials or unusual ports, at most 3 redirects and only within the same host, every resolved address checked at connect time against private/loopback/link-local ranges, 10 s timeout, 5 MB cap, and `application/pdf` or `%PDF-` content. Query strings are never logged. Texts that match zero or several waiting cases, fail the checks, or cannot be parsed change no case state: the case shows an error step and audit entry (or, with no case to attach to, the `bill_link_inbox` row records the outcome). Redelivered message IDs are ignored. The older exact-grammar statement text still works.

Records in demo mode come from the scenario in FinchNode's snapshot shape and run through the real `normalizeFinchRecords`; the case page labels them "synthetic scenario data (no live FinchNode call)". The public signed webhook route does not accept bill links (local receiver only). The hospital-link path has been exercised with unit tests, a local fake PDF server, and the case page in a browser, not against live Spectrum/iMessage.
