# Fish Audio outbound itemized-bill request design

## Goal

Connect the existing Medical Bill Guardian case flow to the user's published Fish Audio agent so a judge can explicitly authorize a real outbound demo call to a consenting teammate role-playing hospital billing. The call represents Medical Bill Guardian, describes the seeded demonstration request, and asks the hospital for an itemized bill.

The feature must preserve the application's existing safety boundary: loading records is read-only, but no real provider contact occurs until the user authorizes it. The post-call statement remains synthetic and deterministic; a queued phone call is not evidence that a hospital supplied a document or confirmed a billing error.

## Supported demo scope

This integration is limited to the synthetic University Hospital case and the destination in `FISH_TEST_TO_NUMBER`. It must not accept a destination number from the browser or case data. The teammate answering that number has consented to role-play hospital billing, and neither participant should use real patient information.

The Fish outbound endpoint accepts the published `agent_id`, rented `phone_number_id`, and destination `to_number`. It does not carry the case brief in the documented request body. Therefore, the published Fish agent must contain the demo script and disclosure. The application will display and audit the matching request brief, but it will not claim to inject unsupported per-call prompt variables.

For this seeded case, the published agent should:

- identify itself as an AI assistant from Medical Bill Guardian;
- disclose that the call is a synthetic hackathon demonstration;
- ask whether the recipient consents to continue;
- state that it is following up on the current University Hospital billing request;
- request an itemized statement containing service dates, billing codes, charges, adjustments, and patient responsibility;
- avoid requesting or sharing real protected health information, financial credentials, or identity-verification data; and
- avoid authorizing payments, settlements, account changes, or other binding actions.

## User flow and state transitions

The existing `REQUESTING_BILL` state becomes a real authorization checkpoint rather than a transient state.

1. `DETECTED`: the user starts the investigation.
2. The orchestrator loads available medical records and attempts encounter matching.
3. The case stops at `REQUESTING_BILL`. No communication request exists and no call has been made.
4. The case page shows a call brief, an explicit synthetic-data disclosure, the configured destination in masked form, and an **Authorize hospital call** action.
5. The user authorizes the action. A dedicated server route validates the case, configuration, and authorization flag, then invokes Fish Audio.
6. A successful `201` response creates one pending `ITEMIZED_BILL_REQUEST` communication containing the Fish `session_id`, records an audit/timeline event, and advances the case to `WAITING_FOR_BILL`.
7. The existing analysis poll continues to retrieve the synthetic statement from the demo provider. The interface clearly labels this statement as a deterministic demo fixture rather than a document received through the phone call.
8. Reconciliation, disputed-charge review, and final notification continue through the existing flow.

The later `REVIEW_REQUIRED` authorization remains separate. It concerns a questioned charge after analysis; the new authorization concerns the initial outbound request for the itemized statement.

## Provider boundary

The communication boundary will gain a Fish-backed demo adapter rather than placing `fetch` calls in a route or React component.

The adapter will:

- read `FISH_API_KEY`, `FISH_AGENT_ID`, `FISH_PHONE_NUMBER_ID`, and `FISH_TEST_TO_NUMBER` only on the server;
- validate that all four values are present and that the destination resembles an E.164 number;
- call `POST https://api.fish.audio/v1/agent/phone-calls` with the three documented JSON fields;
- send `Authorization: Bearer ...`, `Content-Type: application/json`, and a stable per-case `Idempotency-Key`;
- treat only HTTP `201` with a valid `session_id` as success;
- preserve the HTTP status and safe response body in a typed provider error; and
- never log or return the API key or the full destination number.

The adapter's bill-delivery side remains deterministic for the hackathon: after a successful queued call, `getItemizedBill` returns the existing synthetic fixture after the configured delay. This hybrid behavior will be named and labeled as a demo adapter so the UI cannot imply that the phone conversation delivered the statement.

`communicationProvider()` will select the Fish demo adapter only when demo mode is active and all four Fish variables are configured. With no Fish configuration, automated tests and ordinary local development continue using `MockCommunicationProvider`. `DEMO_MODE=false` continues to reject live communication because authentication, consented subjects, encrypted storage, and a production provider adapter are not implemented.

## API and orchestration

`investigateCase` will stop after record retrieval and set `REQUESTING_BILL`; it will no longer contact the communication provider.

A new explicit orchestrator operation will request the itemized bill. It will require:

- `authorized === true`;
- case status `REQUESTING_BILL`; and
- no existing `ITEMIZED_BILL_REQUEST` communication.

The corresponding `POST /api/cases/[id]/request-bill` route will invoke that operation and persist the returned case. Repeat submissions are protected at three layers: UI busy state, case-state validation, and the Fish idempotency key derived from the case ID, action name, persisted demo-run UUID, and destination fingerprint.

The idempotency key will not include timestamps. It will combine the case ID, action name, and a short SHA-256 fingerprint of the persisted demo-run UUID plus normalized destination number. The run UUID is the first audit-entry ID created with the case, so it remains stable across network retries and changes whenever `/api/demo/reset` creates a fresh run. Retrying the same action in one run must refer to the original Fish operation; resetting the demo or changing `FISH_TEST_TO_NUMBER` must create a distinct authorized call attempt without exposing the destination in headers or logs.

## Interface

At `REQUESTING_BILL`, the story view replaces passive progress copy with a focused authorization panel:

- heading: **Call hospital billing for the itemized statement?**
- a concise brief listing the exact fields the agent will request;
- disclosure that the call goes to the configured consenting demo recipient;
- disclosure that the later statement is synthetic and not collected from the call; and
- primary action: **Authorize hospital call**.

While the request is running, the button reads **Calling hospital…** and remains disabled. After the API returns, the case enters `WAITING_FOR_BILL` and shows **Call queued** plus a shortened session reference. The System view exposes the full session ID in the communication result for judge-facing traceability, but never exposes phone numbers or credentials.

The feature reuses the existing visual system. Coral continues to mean consequential authorization; it is not used decoratively. No new global aesthetic direction is required.

## Errors and recovery

Fish failures must be actionable and must not advance the case. The route returns an application error with the upstream HTTP status and response body, after redacting secrets and phone numbers. The UI keeps the authorization panel available for retry and displays the exact status and safe Fish response.

Expected cases include:

- missing configuration: identify the missing environment-variable names without revealing values;
- `401`: invalid or unauthorized API key;
- `402`: insufficient balance;
- `403`: outbound calling disabled;
- `404`: agent or phone number not found;
- `409`: agent not published or an idempotency conflict;
- `422`: invalid or blocked destination; and
- `502`/`503`: upstream telephony failure, retryable with the same idempotency key.

Network errors use a clear message and preserve the case at `REQUESTING_BILL`. Errors are recorded only in the HTTP response for this iteration; a failed call must not create a successful audit event or pending communication.

## Data handling and safety

- The browser sends only `{ authorized: true }`; it never receives Fish credentials or an unmasked destination.
- The outbound payload contains no patient name, medical record, bill line, or other health information.
- The case brief uses only the synthetic provider name and fixed demo request categories.
- The destination remains server configuration and is never user-editable through this unauthenticated application.
- The existing proxy guard remains unchanged.
- A successful call means only that Fish queued a session. It does not mean the hospital answered, agreed, sent a bill, or verified a charge.

## Testing

Unit tests will cover:

- the investigation stopping at `REQUESTING_BILL` without provider contact;
- rejection without explicit authorization;
- rejection in the wrong state or after a request already exists;
- successful transition to `WAITING_FOR_BILL` with the session reference recorded;
- Fish request headers, body, and stable idempotency key using a mocked `fetch`;
- identical destinations producing identical idempotency keys while different destinations produce different keys;
- resetting the demo producing a different idempotency key even when the case ID and destination remain unchanged;
- configuration validation and E.164 validation;
- propagation and redaction of non-`201` Fish errors;
- provider selection with and without all Fish variables; and
- presentation copy for the authorization, queued, and error states.

Project verification remains `npm test`, `npm run typecheck`, and `npm run build`. Manual verification will use a stubbed Fish response by default. A real call is never part of automated tests and will only occur when a human presses the authorization control in an environment containing all four Fish variables.

## Delivery

The work will continue on `codex/receipt-trace-demo`, alongside the existing frontend redesign. The pull request description will call out the real outbound side effect, the explicit authorization gate, the fixed published-agent script, and the synthetic nature of the returned statement.
