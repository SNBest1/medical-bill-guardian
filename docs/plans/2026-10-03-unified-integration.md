# Receipt Trace + SpacetimeDB + email integration plan

Date: 2026-10-03. Branch: `integration/receipt-spacetime-email` from `origin/feat/spacetimedb-backend`.

## Intent and assumptions

The receipt trace branch supplies the patient-facing presentation, the SpacetimeDB branch supplies case state and owner-filtered storage, and the guardian branch supplies the evidence, PDF, insurance, and billing-review concepts. The original branches have incompatible Next.js and Vite application shells, so this is a selective port rather than a Git merge of every file. The result must remain a reliable synthetic demo when Nessie, FinchNode, Resend, or the provider mailbox is unavailable. Resend is the selected HTTP email sender; `ai@nipunsaini.com` is the reply address. The user named `nipun.saini9@gmail.com` as the test billing recipient and has a Resend API key; the verified sender address and key must be configured locally before real delivery.

## Architecture

```text
Receipt Trace React/Vite UI ── SpacetimeDB client ── private case tables
          │                         │                     ▲
          │ authorize review        │ owner views         │ trusted reducer calls
          └── Cloudflare Worker ────┴── Resend REST ──► provider billing
                    ▲                                   │
                    └──── ai@nipunsaini.com ◄───────────┘
                         Email Routing / raw MIME
                         PDF extraction + reconciliation
```

One Cloudflare Worker serves Vite assets and handles inbound email and a narrow authenticated outbound email endpoint. SpacetimeDB remains the source of truth for case state, findings, communications, and audit events. The Worker may call guarded SpacetimeDB reducers through its server-side token; browser code never receives that token, a Resend key, or the raw inbound email. The module keeps its deterministic mock statement and mock provider response for demo mode, with separate states for requested, sent, and received real email. Missing evidence remains review-only; savings are shown only after a documented provider adjustment.

## Work packages and verification

1. **Branch and contract audit.** Preserve the current checkout's untracked `dist/` and `spacetimedb/` directories in an isolated worktree. Use the SpacetimeDB branch as base. Inventory the receipt components and guardian PDF/insurance/dispute functions; do not copy obsolete Next routes. Verify branch ancestry, clean worktree, and existing backend tests.
2. **Presentation port.** Port receipt-trace layout, styling, evidence workspace, status copy, and timeline into the Vite app. Replace hard-coded hospital and charge counts with case data. Keep the SpacetimeDB subscriptions/actions and add visible email pending, reply received, and correction states. Verify component tests, typecheck, build, and a browser walkthrough at mobile and desktop widths.
3. **Case-state bridge.** Extend private SpacetimeDB tables/reducers for explicit email authorization, outbound message ID, inbound idempotency, PDF-derived bill items, insurance/price findings, and provider outcome. Guard trusted ingestion by the database-owner/worker identity and owner actions by `ctx.sender`. Keep the existing scheduled mock delivery/review path as fallback. Verify reducer tests and owner-isolation smoke tests.
4. **Bank/EHR fallback.** Make a server-side connector path that attempts configured Nessie and FinchNode sandbox reads, normalizes results, and falls back to labeled mock data on unavailable APIs or no consented subject. Never silently present a mock record as a live match. Verify success, empty, timeout/error, and duplicate-scan cases.
5. **Outgoing email.** Build a Resend REST adapter with a verified sender domain, `reply_to: ai@nipunsaini.com`, case-specific subject/reference, and idempotency key. Send only after case-owner authorization; record success or failure and keep a pending state until a genuine reply arrives. In demo mode, record a mock email and simulate a reply without external delivery. Verify exact request shape and no send before approval.
6. **Inbound email Worker.** Configure `addresses: ["ai@nipunsaini.com"]` in Wrangler. Parse raw MIME with `postal-mime`, check size/type, validate case correlation and expected provider, deduplicate by message ID/hash, extract PDF text in the Worker, normalize the bill, and call a trusted SpacetimeDB reducer. Treat email body, sender, URLs, and PDF contents as untrusted. Do not accept a bare `From` header as proof of a billing correction. Verify with local RFC 5322 messages containing a synthetic PDF, duplicate deliveries, malformed attachments, and wrong case tokens.
7. **Cloudflare setup and end-to-end checks.** Use the existing Wrangler login to validate/build/deploy the Worker and add its Email Routing rule without touching other addresses or catch-all. Use a temporary Wrangler tunnel only for local SpacetimeDB connectivity tests; a durable deployment should point the Worker at a reachable SpacetimeDB host. Confirm routing and sender-domain prerequisites before sending real email. Run unit tests, module publish/generation, smoke test, Wrangler dry run, deployed health/routing tests, and a full mock demo. Commit coherent batches throughout.

## Acceptance criteria

- The new branch contains the receipt-trace UI on the Vite/SpacetimeDB app, with a working mobile and desktop case walkthrough.
- Case state, timeline, evidence, and audit data come from SpacetimeDB, with cross-owner isolation still passing.
- The mock path finishes the hospital story without Nessie, FinchNode, Resend, or a live mailbox.
- The real path prepares and sends only authorized billing emails, receives `ai@nipunsaini.com` mail in a Worker, parses a PDF attachment, and stores a correlated, deduplicated result; provider confirmation is required before declaring a correction.
- Credentials and raw patient records are excluded from Git and browser bundles. Missing external credentials are reported as a disabled live path, not as a successful send.

## Known constraints

- Cloudflare Email Routing is enabled for `nipunsaini.com`, and no specific `ai@` rule exists. Wrangler is logged in. Existing forwarding rules and catch-all must remain untouched.
- The user has a Resend API key and specified `nipun.saini9@gmail.com` as the test recipient. The key is not in this worktree's `.env` yet, and the verified sender address is not known. Both are required for a live send.
- The current SpacetimeDB browser token is a demo identity, not production patient authentication. This integration must not remove the synthetic-only boundary or claim production readiness.
- Cloudflare Workers receive email directly; a tunnel is useful only to reach a local SpacetimeDB server during development. It is not part of inbound mail routing.
