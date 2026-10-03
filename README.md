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

Open [http://localhost:3000](http://localhost:3000). Demo mode is on by default and scans the seeded payment when the dashboard loads. Open the University Hospital case and click **Investigate this bill**. The mock provider delivers a plain-text statement after a short delay; the case parses it and compares six charges with the available records. Inspect the $700 specialist item, then click **Authorize billing review**. The mock provider confirms that charge duplicated services already included in the ER charge, and the app records the $4,120 corrected total. Expand **Activity and communications** to inspect tool steps and mock exchanges. Repeating a scan returns the same case because transaction IDs are unique.

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
