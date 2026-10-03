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
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Demo mode is on by default and scans the seeded payment when the dashboard loads. Open the University Hospital case, click **Investigate this bill**, inspect the $700 specialist item, then click **Authorize billing review**. The mock provider confirms the duplicate and the app records the $4,120 corrected total. Repeating a scan returns the same case because transaction IDs are unique.

Use **Restart demo** below a completed case summary to replay the case from payment detection.

Run checks with `npm test`, `npm run typecheck`, and `npm run build`.

## Demo safety and scope

- A missing clinical match means **needs review**. It never proves the charge is invalid or fraudulent.
- The $700 correction is shown only after the mock hospital response confirms it. Price benchmarking is deliberately not claimed.
- The authorization button is required before the mock billing review. No bank chargeback is initiated.
- `DEMO_MODE=true` makes zero external bank, EHR, or hospital calls. If `OPENAI_API_KEY` is set, only structured synthetic case facts are sent to OpenAI for the optional summary; omit the key to keep the entire demo offline.
- `DEMO_MODE=false` blocks all case and API routes until user identity, patient consent, encrypted storage, and a live communication adapter are implemented. Nessie and FinchNode adapter code is present for later integration, but the app does not expose real patient data in this state.

## Integration configuration

Copy `.env.example` for all variables. Nessie needs a sandbox API key, customer ID, and the HTTPS base URL supplied for the hackathon. The adapter reads account purchases and resolves merchant IDs to merchant names. FinchNode needs a server-side API key and a subject from a completed patient Connect consent flow; it uses the [consent-filtered records endpoint](https://finchnode.com/products/records-api). Relay/Photon is behind `CommunicationProvider`, but the exact live API contract is still required before an adapter can safely place calls. No credential belongs in source control.

## API

`GET /api/transactions`, `POST /api/transactions/scan`, `GET|POST /api/cases`, `GET /api/cases/:id`, `POST /api/cases/:id/run`, `POST /api/cases/:id/request-review`, `POST /api/cases/:id/notify`, and read-only medical-record, communication, and timeline routes under `/api/cases/:id/`.
