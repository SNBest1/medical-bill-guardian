# Medical Bill Guardian

Medical Bill Guardian opens a case when a hospital payment appears, compares the itemized bill with available medical evidence, and asks the patient before contacting billing. The backend is a SpacetimeDB module; the built-in demo runs the synthetic University Hospital story with no hospital, bank, or medical-record API calls.

## Architecture

```text
 Browser (React + Vite, Cloudflare Workers static assets)
   │  subscribes to per-user views: my_cases, my_timeline, ...   ◄── live pushes
   │  calls reducers: scan_demo_payment, investigate_case,
   │                  authorize_review, reset_demo
   ▼
 SpacetimeDB module (TypeScript, spacetimedb/)
   ├─ private tables: bill_case, medical_record, bill_item, finding,
   │                  timeline_event, audit_entry, communication
   ├─ public views filtered by ctx.sender (the case owner)
   ├─ reducers: the case state machine
   ├─ schedule table bill_delivery → deliver_bill (~2 s after investigation)
   └─ pure logic (spacetimedb/src/logic): parse, match, reconcile, summarize
```

SpacetimeDB is the whole backend. Each case is stored as rows across private tables; reducers move it through `DETECTED → WAITING_FOR_BILL → REVIEW_REQUIRED → USER_NOTIFIED`, and every step writes an audit entry and a timeline event. Clients can read only through views filtered by their own identity, so each browser gets its own private demo case. The mock hospital's statement arrives from a scheduled reducer about two seconds after investigation, and every subscribed tab updates live — there is no polling.

The billing logic in `spacetimedb/src/logic/` is plain TypeScript with no SpacetimeDB imports, so Vitest tests it directly. Money is stored as integer cents. The React client reassembles view rows into the display model in `src/lib/assemble.ts`.

## Quick start

Requires Node.js 22+ and the SpacetimeDB CLI (`curl -sSf https://install.spacetimedb.com | sh`).

```bash
npm ci
npm ci --prefix spacetimedb
cp .env.example .env.local
spacetime start
```

In a second terminal:

```bash
spacetime publish -s local --module-path spacetimedb medical-bill-guardian
npm run spacetime:generate
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Your demo case appears automatically. Open it and click **Investigate this bill**: records appear at once, and the itemized bill arrives about two seconds later. Inspect the $700 specialist item, then click **Authorize billing review**. The mock provider confirms that charge duplicated services already included in the ER charge, and the case records the $4,120 corrected total. **Restart demo** replays the case from payment detection. A second browser profile or private window gets its own separate case.

Checks:

```bash
npm test
npm run typecheck
npm run build
npm run smoke
```

`npm run smoke` starts a throwaway SpacetimeDB server on port 3100 and runs the full story, including checks that a stranger cannot read or act on someone else's case and that a client cannot force the scheduled bill delivery.

## Demo safety and scope

- A missing clinical match means **needs review**. It never proves the charge is invalid or fraudulent.
- The $700 correction is shown only after the mock hospital response confirms it. Price benchmarking is deliberately not claimed.
- Only the case owner can call `authorize_review`, the single path to (mock) provider contact. No bank chargeback is initiated.
- The module contains only mock providers and makes no network calls, so it cannot reach a bank, EHR, or hospital.
- All data is synthetic. Tables are private and readable only through per-owner views, but there is no real authentication, consent tracking, or encrypted storage — do not enter real patient data.

## Reference integrations

`src/services/banking/nessie.ts` and `src/services/medical/finchnode.ts` are adapters kept from earlier work, with their tests. Nothing imports them, so they are not bundled; they document the sandbox field mappings for later live work. Their variables are listed in `.env.example` and belong in the ignored `.env`.

For this checkout, a synthetic Nessie customer, account, University Hospital merchant, and $4,820 purchase were created and verified through the sandbox read endpoints; their IDs remain in the ignored `.env`. The FinchNode sandbox key was validated, but its synthetic Connect sessions still report `syncing` and have not issued an app-scoped subject. These separate synthetic sources do not establish that a FinchNode patient had the University Hospital visit in the demo.

The [Relay staging API](https://docs.staging.relayapp.im/api-reference/overview) uses a server-side Agent Token and Relay handles; its documented calls reach people in Relay chats, not ordinary hospital phone lines. A staging agent named `medical_bill_guardian` exists, created with the project-local CLI (`./node_modules/.bin/relay`). No Relay adapter is implemented.
