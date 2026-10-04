# Medical Bill Guardian

Medical Bill Guardian opens a case for a hospital payment, checks an itemized statement against available clinical evidence, and asks the patient before requesting a billing review. The receipt trace interface comes from `codex/receipt-trace-demo`; the stateful backend comes from `feat/spacetimedb-backend`. A complete synthetic story runs without bank, medical, or email service access.

## Architecture

```text
Nessie sandbox ─┐
               ├─ Cloudflare Worker ── authenticated case import ─┐
FinchNode ─────┘    │                                                │
     mock fallback  │ Resend outbox / Email Routing inbox            ▼
                    └─ MIME + bounded PDF text parsing ──────► SpacetimeDB
                                                              private cases,
React + Vite receipt UI ◄──── owner-filtered live views ◄───── findings, audit
```

`spacetimedb/src/index.ts` owns transitions and authorization. `spacetimedb/src/logic/` parses and reconciles charges using deterministic rules. `worker/` is the trusted bridge for sandbox APIs and email; browser code never receives Nessie, FinchNode, Resend, or database publisher tokens. Each browser identity reads only its own case views. Clinical absence means **needs review**, never proof of an invalid charge. Only the labeled mock provider response creates the demo's $700 correction. Real email replies stay pending verification and cannot claim savings.

## Local demo

Requires Node.js 22+ and the [SpacetimeDB CLI](https://spacetimedb.com/install).

```bash
npm ci
npm ci --prefix spacetimedb
cp .env.example .env.local
spacetime start
```

In another terminal:

```bash
spacetime publish -s local --module-path spacetimedb medical-bill-guardian
npm run spacetime:generate
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The synthetic University Hospital payment appears automatically. Open the case, investigate, inspect the six bill charges and their evidence, then authorize the **simulated** review to see the confirmed $700 correction. The separate real email controls remain hidden until `VITE_EMAIL_ENABLED=true` and the Worker is configured. The local Vite server does not run the email Worker.

```bash
npm test
npm run build
npm run smoke
```

`npm run smoke` starts its own temporary SpacetimeDB server, exercises the case workflow and access rules, then stops it.

## Sandbox discovery and email

The Worker route `POST /api/sandbox/discover` verifies the browser's SpacetimeDB bearer token against the claimed owner identity. It reads a configured Nessie customer and a consented FinchNode subject. When Nessie is unavailable, it opens the complete **MOCK** case. If Nessie succeeds but FinchNode is unavailable, it stores the bank purchase with **no** invented clinical records. FinchNode records are kept only when provider and date match the purchase. Sandbox and mock provenance stays on the case.

The case owner can request a real itemized statement and, after analysis, authorize a real billing review. `worker/index.ts` polls only authorized pending email rows; `worker/resend.ts` sends to the configured test contact `nipun.saini9@gmail.com` from `billing@nipunsaini.com`, with replies to `ai@nipunsaini.com`. Cloudflare Email Routing delivers that mailbox to the Worker. It correlates the subject's case marker and extracts a single bounded PDF attachment. The parser currently accepts text PDFs following the synthetic `Invoice:`, `Provider:`, `Service date:`, charge rows, and `Total:` format. Scans, unfamiliar hospital layouts, multiple PDFs, and unverified replies remain pending for manual handling. No bank chargeback is initiated.

The deployed Worker and separate synthetic database use:

- Worker: `medical-bill-guardian`, [deployment](https://medical-bill-guardian.nipunsaini123456.workers.dev)
- SpacetimeDB: `medical-bill-guardian-email` on `maincloud.spacetimedb.com`
- Inbound route: `ai@nipunsaini.com`, configured in `wrangler.jsonc`

Set Worker secrets with `wrangler secret put SPACETIME_OWNER_TOKEN` and `wrangler secret put RESEND_API_KEY`; the first must belong to the database publisher. Put optional Nessie and FinchNode keys and subject in Worker secrets to enable sandbox discovery. Build the browser for the target database using the `VITE_` settings in `.env.local`. `EMAIL_SEND_ENABLED` defaults to `false` in `wrangler.jsonc`; enable it only when the sending key and test contact have been verified. Never commit `.env`, `.env.local`, `.dev.vars`, or patient data.

The [Cloudflare email handler](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/), [routing address configuration](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/), [Resend send API](https://resend.com/docs/api-reference/emails/send-email), and [SpacetimeDB HTTP API](https://spacetimedb.com/docs/http/database/) are the integration contracts. `docs/plans/2026-10-03-unified-integration.md` records the branch merge decisions.

## Scope and safety

All seeded data is synthetic. The app does not implement real patient login, a consent grant flow, encrypted medical storage, general hospital PDF parsing, or evidence-backed confirmation of a real billing correction. Keep real patient records and real hospital recipients out of this demo deployment. Relay and Photon reference code from the earlier branch is retained only for historical context; email is the active communication path.
