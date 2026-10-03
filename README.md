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
