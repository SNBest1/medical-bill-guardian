# Medical Bill Guardian checklist

Status 2026-10-03. All checked items are implemented; a deployed service is not considered verified merely because it accepted a deployment.

## Integrated and verified

- [x] Create `integration/receipt-spacetime-email` from the SpacetimeDB backend and port the receipt trace frontend.
- [x] Preserve a full mock $4,820 → $4,120 story: six charges, five supported services, one $700 review, provider-confirmed synthetic correction.
- [x] Keep clinical absence separate from a proven billing error; no invented market price or bank chargeback.
- [x] Show dashboard, evidence selection, timeline, audit activity, resolution, and mobile layout.
- [x] Keep SpacetimeDB tables private and views filtered by browser identity; require owner action for bill request and billing review.
- [x] Add automatic, authenticated sandbox discovery with a complete mock fallback when Nessie is unavailable, and no invented records when FinchNode is unavailable for a Nessie payment.
- [x] Verify the deployed page imports the synthetic Nessie purchase as a separate case; restrict mock evidence and correction actions to the demo transaction.
- [x] Add Resend outbound Worker, Cloudflare Email Routing inbound Worker, MIME parsing, bounded PDF extraction, case correlation, and message ID deduplication.
- [x] Require verified provider evidence before changing savings in the real email path; a plain reply stays pending verification.
- [x] Gate real email controls in the frontend; default Worker sending to disabled.
- [x] Publish an isolated SpacetimeDB Maincloud database and deploy a Worker with the `ai@nipunsaini.com` inbound route.
- [x] Verify tests (40), typechecks, production build, SpacetimeDB smoke test, Wrangler dry run, desktop/mobile UI, and a temporary Wrangler tunnel. The tunnel was closed after testing.
- [x] Store existing keys only in ignored local files or Worker secrets; commit `.env.example` without values.

## Still needed for live email

- [ ] Verify that the Resend key can send from `billing@nipunsaini.com` to the authorized test inbox. Direct API requests from this machine returned Cloudflare 1010, so delivery is unverified.
- [ ] Send and receive one synthetic PDF test through the deployed Worker; confirm the outbound communication becomes `SENT` and the reply is parsed into bill items.
- [ ] Enable `EMAIL_SEND_ENABLED=true` and `VITE_EMAIL_ENABLED=true` only after the above test. Both are currently false.
- [x] Configure the existing synthetic Nessie sandbox credentials as Worker secrets.
- [ ] Obtain a consented FinchNode subject for the same patient. Until then, a Nessie case has no clinical evidence and the separate mock case carries the complete demo.
- [ ] Parse real provider PDF layouts, scans, and links; current parser accepts one text PDF using the synthetic statement grammar only.
- [ ] Add durable retry/dead-letter handling and provider identity verification beyond a sender-address filter.

## Before real patient use

- [ ] Add real patient login, bank account ownership, FinchNode consent, encrypted storage, and retention/deletion controls.
- [ ] Port and validate the previous guardian PDF/claim/rate-reference dispute path if still required. It is not active in the SpacetimeDB/email runtime.
- [ ] Add evidence-backed resolution verification and patient notification for a real adjustment.
- [ ] Complete privacy and security review with real service agreements.

The active demo is synthetic. Relay/Photon phone or chat contact is no longer the active communication path.
