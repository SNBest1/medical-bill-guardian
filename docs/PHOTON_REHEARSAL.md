# Photon statement delivery and text rehearsal

This covers the signed-statement inbox and the operator-only outbound text path built on
`spectrum-ts` (Photon's Spectrum SDK, iMessage provider). Nothing here contacts a real hospital or
patient; the gates below exist to keep it that way until an operator explicitly says otherwise.

## Two ways to receive the hospital's statement

Both land in the same `statement_inbox` SQLite table, deduplicated by Spectrum's own message ID, so
running both at once (or switching between them) never double-applies or loses a statement.

1. **Public signed webhook** — `POST /api/integrations/photon/webhook`. Requires a reachable HTTPS
   URL (e.g. a tunnel) registered with Spectrum Cloud, which returns a signing secret to save as
   `SPECTRUM_WEBHOOK_SECRET`. Verifies `X-Spectrum-Signature`/`X-Spectrum-Timestamp` over the exact
   raw body (never re-serialized), rejects anything older/newer than 300 seconds, caps the body at
   128 KiB with a true bounded streaming read (it stops reading as soon as the cap is exceeded
   rather than buffering an unbounded body first), and only then checks sender/DM/platform/grammar.
   Only expose this one route through a tunnel — never the unauthenticated case app.

2. **Local SDK receiver** — `scripts/photon-receiver.mjs`. Holds a live Spectrum connection
   (`for await (const [space, message] of app.messages)`) and forwards each inbound DM over
   loopback to `POST /api/integrations/photon/local-intake`, which is authenticated with
   `GUARDIAN_WORKER_TOKEN` (the same token `/api/integrations/tick` uses) instead of an HMAC — the
   trust boundary is "this is our own process on loopback," not "this crossed the public internet."
   It enforces the identical sender/DM/platform/grammar policy as the webhook
   (`evaluateInboundPhotonMessage` in `photon-inbox.ts`, shared by both transports) and never sends
   anything. Use this when there is no tunnel available.

Either way, `processPhotonInbox` (drained by `POST /api/integrations/tick`, polled by
`scripts/integration-worker.mjs`) applies queued statements transactionally: a case with an active
operation guard defers the statement for the next tick instead of racing it, a statement for any
case other than the seeded demo one is rejected without touching the case, and a redelivered
message with the same ID is a no-op.

## Outbound text (operator-only)

`POST /api/cases/[id]/photon` requires `GUARDIAN_WORKER_TOKEN`, `PHOTON_DEMO_TEXTS=true`, and an
explicit `{ action, authorized: true }` body — never browser-reachable, never free text (only the
two fixed templates in `photonText()`: `REQUEST_STATEMENT` and `NOTIFY_PATIENT`). A `photon_outbox`
row, keyed by `${caseId}:${action}`, makes a retry safe:

- **FAILED** — the attempt never reached Spectrum (bad recipient, missing credentials, the
  connection itself failed to start). Free to retry with another authorized request.
- **UNCERTAIN** — the SDK call was actually dispatched and its outcome is unknown (no message ID
  came back, or the call threw after being sent). The route refuses to retry this automatically;
  resolve it with `POST /api/cases/[id]/photon/recover` (`{ action, resolution: "DELIVERED" |
  "FAILED", messageId? }`) after checking Spectrum/iMessage directly. `DELIVERED` records the
  confirmed message ID; `FAILED` reopens the row for exactly one more authorized retry.
- **ACCEPTED** — the SDK confirmed acceptance (not delivery). Further requests for the same
  `${caseId}:${action}` key return the cached result instead of resending.

`sendPhotonText` and the route both throw `PhotonSendUncertainError` only once the SDK has actually
been invoked, so the FAILED/UNCERTAIN split is based on what actually happened, not a guess.

## Sending the patient the final summary

`NOTIFY_PATIENT` only builds once `status === "USER_NOTIFIED"` and a saved `summary` exists — i.e.
after `notifyCase` has already recorded the provider-confirmed outcome. Reaching this state does
not by itself authorize a send: that still requires an operator to call the route with
`authorized: true` while `PHOTON_DEMO_TEXTS=true`.

**Before running any rehearsal that actually dials out to Spectrum Cloud (sets
`PHOTON_DEMO_TEXTS=true` with real `SPECTRUM_PROJECT_ID`/`SPECTRUM_PROJECT_SECRET` and sends to
`DEMO_HOSPITAL_PHONE`/`DEMO_PATIENT_PHONE`), get the user's explicit go-ahead first.** Nothing in
this repository will do that on its own.

## Testing retries and restarts (safe — synthetic, no network)

- `npm test -- src/services/communications/photon-inbox.test.ts` — signature/replay rejection,
  sender/DM/platform/grammar checks, dedup + deferral while a case operation is held, rejection of
  a wrong-case statement without mutating anything, and a restart test that reopens a file-backed
  `CaseStore` on the same SQLite file to confirm a statement queued before the "crash" is applied
  exactly once after, and a redelivered copy afterward is still a no-op.
- `npm test -- src/services/communications/photon-receiver.test.ts` — the local-receiver parser
  against the live SDK message shape, and a dedup test proving a statement delivered once via the
  webhook parser and once via the local-receiver parser (same Spectrum message ID) is only applied
  once.
- `npm test -- src/services/communications/photon-text.test.ts` — the FAILED/UNCERTAIN split, using
  an injected fake `PhotonConnection` so no real SDK or network call ever happens.
- `npm test -- src/lib/db.test.ts` — outbox begin/fail/retry/recover transitions, and a restart test
  reopening the same SQLite file to confirm outbox and inbox state survive unchanged.

## Running the receiver or a real webhook for real

Both `scripts/photon-receiver.mjs` and registering a public webhook make a real outbound connection
to Spectrum Cloud using real project credentials. Run them yourself when you are ready to rehearse
against the real sandbox; an agent session should not start either without asking first.
