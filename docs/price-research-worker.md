# Active price research worker

`POST /api/research/prices` fetches Michigan Medicine's public standard-charge archive on demand, extracts the exact CPT/HCPCS code, and returns source URLs, retrieval date, SHA-256, original row numbers, candidate rates, methodology, context gaps, and billing questions. Python 3 and the existing hospital importer must be available. Temporary archives are removed after each request.

Example synthetic request:

```json
{"requestId":"research_demo","code":"99285","codeSystem":"CPT","provider":"UNIVERSITY OF MICHIGAN HEALTH","serviceDate":"2026-04-20","billedAmount":2000,"coverage":"SELF_PAY"}
```

Optional context: providerNpi, units, setting (INPATIENT/OUTPATIENT), component (FACILITY/PROFESSIONAL/GLOBAL), modifiers (an empty array confirms none), payer, plan, network. Insured matching requires the publisher's exact payer and plan labels. Patient names, records, and extra fields are rejected. Do not put patient identifiers into the permitted free-text fields either.

This is a demo-only tool, blocked when DEMO_MODE=false. It does not change cases or the main workflow. Live fetch failure returns 502 without silently substituting old data. The separately exported cached lookup is explicitly labeled CACHED_SNAPSHOT.

## Interpreting results

No result asserts a correct patient balance, confirmed billing error, or refund. Published cash/negotiated amounts are evidence candidates. Contract applicability on the service date, units, bundling, percentage methodology, benefits and the final EOB still require verification. The adapter currently supports one publisher; other hospitals need dedicated source adapters. Downloading today does not make the publisher's older rates current for every service date.

## Relay integration boundary

`parseRelayResearchCommand` accepts `RESEARCH_PRICE` followed by a newline and the same JSON. After calling the research worker, `sendRelayResearchReply` can return a `PRICE_RESEARCH_RESULT` to an explicitly approved existing chat with an environment-matching Agent Token and an idempotency key.

These are transport helpers, not a deployed Relay bot. No agents, subscriptions, listener processes, or messages were created. Activation requires an identified research bot/chat and a receiver that verifies Relay signatures, durably records events before acknowledgement, rejects unapproved senders, deduplicates message IDs, and ignores its own result messages. Preserve the main agent's routing. Keep tokens server-side; do not pass patient records through this public-pricing worker.

Verification: `npm test -- src/services/research/price-research.test.ts`. Optional actual publisher download: `PRICE_RESEARCH_LIVE_TEST=1 npm test -- src/services/research/price-research.test.ts`.
