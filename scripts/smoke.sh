#!/usr/bin/env bash
# Runs the University Hospital story against a throwaway local SpacetimeDB server.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
DB="mbg-smoke"
# Own port so a running app or `spacetime start` on 3000 does not interfere.
ADDR="127.0.0.1:3100"
SERVER="http://$ADDR"
# Another server on this port would silently receive every call below; refuse to run against it.
if curl -sf "$SERVER/v1/ping" >/dev/null 2>&1; then echo "SMOKE FAIL: $ADDR is already in use; stop that server first" >&2; exit 1; fi
DATA_DIR="$(mktemp -d)"
spacetime start --listen-addr "$ADDR" --data-dir "$DATA_DIR" >"$DATA_DIR/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; rm -rf "$DATA_DIR"' EXIT
for _ in $(seq 1 30); do curl -sf "$SERVER/v1/ping" >/dev/null 2>&1 && break; sleep 0.5; done
kill -0 "$SERVER_PID" 2>/dev/null || { echo "SMOKE FAIL: local server did not start; see $DATA_DIR/server.log" >&2; exit 1; }

call() { spacetime call -y -s "$SERVER" "$DB" "$@"; }
sql() { spacetime sql -y -s "$SERVER" "$DB" "$1"; }
fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }

spacetime publish -y -s "$SERVER" --module-path spacetimedb "$DB" >/dev/null

call scan_demo_payment
call scan_demo_payment   # second scan must not create a second case
[ "$(sql "SELECT id FROM bill_case" | grep -cE '^\s*[0-9]+\s*$')" = "1" ] || fail "repeated scan created a duplicate case"

call investigate_case 1
call investigate_case 1  # second click is a no-op, not an error
sql "SELECT status FROM bill_case" | grep -q WAITING_FOR_BILL || fail "case did not wait for the bill"

spacetime call -y -s "$SERVER" --anonymous "$DB" authorize_review 1 2>/dev/null && fail "a stranger authorized review"
# Expected failures exit non-zero, so capture the output before searching it (pipefail would mask a match).
denied=$(spacetime sql -y -s "$SERVER" --anonymous "$DB" "SELECT * FROM bill_case" 2>&1 || true)
grep -q "may be marked private" <<<"$denied" || fail "private table visible to a stranger"
# Positive control: the owner's view shows the case, so an empty stranger view means isolation, not a broken query.
sql "SELECT * FROM my_cases" | grep -q CASE-4821 || fail "owner's view does not show the case"
stranger_view=$(spacetime sql -y -s "$SERVER" --anonymous "$DB" "SELECT * FROM my_cases" 2>&1) || fail "stranger's view query failed: $stranger_view"
grep -q CASE-4821 <<<"$stranger_view" && fail "a stranger's view shows the owner's case"
spacetime call -y -s "$SERVER" --anonymous "$DB" investigate_case 1 2>/dev/null && fail "a stranger investigated the case"
# A client must not be able to force the scheduled bill delivery.
forced=$(call deliver_bill '{"scheduled_id":99,"scheduled_at":{"Time":{"__timestamp_micros_since_unix_epoch__":0}},"case_id":1}' 2>&1 || true)
grep -q "only be run by the scheduler" <<<"$forced" || fail "a client called deliver_bill"

sleep 3
sql "SELECT status FROM bill_case" | grep -q REVIEW_REQUIRED || fail "bill was not delivered and analyzed"
[ "$(sql "SELECT id FROM bill_item" | grep -cE '^\s*[0-9]+\s*$')" = "6" ] || fail "expected six bill items"

call authorize_review 1
sql "SELECT status FROM bill_case" | grep -q USER_NOTIFIED || fail "case did not finish"
sql "SELECT resolution FROM bill_case" | grep -q 412000 || fail "corrected total is not 412000 cents"

# Restart while a bill is pending: the scheduled delivery must be removed with the case.
call reset_demo
call scan_demo_payment
call investigate_case 2
[ "$(sql "SELECT case_id FROM bill_delivery" | grep -cE '^\s*[0-9]+\s*$')" = "1" ] || fail "investigation did not schedule a bill delivery"
call reset_demo
[ "$(sql "SELECT case_id FROM bill_delivery" | grep -cE '^\s*[0-9]+\s*$')" = "0" ] || fail "reset left a pending bill delivery"

# Email authorization creates an outbox item but never schedules mock delivery.
call scan_demo_payment
call request_itemized_bill_email 3
sql "SELECT status FROM bill_case" | grep -q WAITING_FOR_BILL || fail "email bill request did not wait"
[ "$(sql "SELECT case_id FROM bill_delivery" | grep -cE '^\s*[0-9]+\s*$')" = "0" ] || fail "email request scheduled a mock bill"
spacetime call -y -s "$SERVER" --anonymous "$DB" record_outbound_email 3 EMAIL_ITEMIZED_BILL_REQUEST outbound-3 2>/dev/null && fail "stranger recorded an outbound email"
call record_outbound_email 3 EMAIL_ITEMIZED_BILL_REQUEST outbound-3
statement='Invoice: UH-48291
Provider: University Hospital
Service date: 2026-09-28
Charges
Emergency room | 99285 | 1100.00
CT scan | - | 1800.00
X-ray | - | 450.00
Suture repair | - | 600.00
Medication | - | 170.00
Specialist consultation | - | 700.00
Total: 4820.00'
statement_json=$(STATEMENT="$statement" node -e 'process.stdout.write(JSON.stringify(process.env.STATEMENT))')
spacetime call -y -s "$SERVER" --anonymous "$DB" ingest_provider_bill_email 3 inbound-bill-3 "$statement_json" 2>/dev/null && fail "stranger ingested a provider bill"
call ingest_provider_bill_email 3 inbound-bill-3 "$statement_json"
sql "SELECT status FROM bill_case" | grep -q REVIEW_REQUIRED || fail "provider bill was not reconciled"
call ingest_provider_bill_email 3 inbound-bill-3 "$statement_json"
[ "$(sql "SELECT id FROM bill_item" | grep -cE '^\s*[0-9]+\s*$')" = "6" ] || fail "duplicate email added bill items"
call authorize_email_review 3
sql "SELECT status FROM bill_case" | grep -q WAITING_FOR_PROVIDER || fail "email review did not wait for provider"
call record_outbound_email 3 EMAIL_BILLING_REVIEW outbound-review-3
call ingest_provider_review_email 3 inbound-review-3 'We are reviewing this charge.'
sql "SELECT status FROM bill_case" | grep -q WAITING_FOR_PROVIDER || fail "unverified email resolved the case"
resolution_row=$(sql "SELECT resolution FROM bill_case")
grep -Eq 'None|none|null|NULL' <<<"$resolution_row" || fail "unverified email created savings: $resolution_row"

owner_identity=$(sql "SELECT owner FROM bill_case" | grep -oE '[a-f0-9]{64}' | head -1)
[ -n "$owner_identity" ] || fail "could not read case owner identity"
records_json='[{"kind":"encounter","description":"Synthetic urgent care visit","date":"2026-09-28","provider":"Example Clinic"}]'
call ingest_external_case "$owner_identity" external-txn-1 'Example Clinic' 12300 2026-09-28 NESSIE_SANDBOX FINCHNODE_SANDBOX "$records_json"
call ingest_external_case "$owner_identity" external-txn-1 'Example Clinic' 12300 2026-09-28 NESSIE_SANDBOX FINCHNODE_SANDBOX "$records_json"
[ "$(sql "SELECT id FROM bill_case" | grep -cE '^\s*[0-9]+\s*$')" = "2" ] || fail "duplicate external transaction created another case"
call reset_demo
[ "$(sql "SELECT id FROM bill_case" | grep -cE '^\s*[0-9]+\s*$')" = "1" ] || fail "reset_demo removed an external case"

echo "SMOKE PASS"
