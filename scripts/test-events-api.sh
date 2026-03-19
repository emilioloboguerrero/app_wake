#!/usr/bin/env bash
# test-events-api.sh — §7.6 Creator Events + §8 Public Events endpoint tests
# Usage: bash scripts/test-events-api.sh <email> <password>

set -euo pipefail

BASE="${BASE:-http://localhost:5001/wolf-20b8b/us-central1/api/api/v1}"
API_KEY="AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${RESET}  $1"; }
fail() { echo -e "${RED}✗ FAIL${RESET}  $1"; FAILURES=$((FAILURES + 1)); }
section() { echo -e "\n${BOLD}${YELLOW}── $1 ──${RESET}"; }
FAILURES=0

echo -e "${BOLD}Wake — Creator Events + Public Events API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-events-api.sh <email> <password>"
  exit 1
fi

section "Getting Firebase ID token"
TOKEN_RESPONSE=$(curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"returnSecureToken\":true}")

TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('idToken',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  ERROR=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message','Unknown error'))" 2>/dev/null)
  fail "Could not get token: $ERROR"
  exit 1
fi
pass "Token acquired (${TOKEN:0:20}...)"

# ── Helpers ───────────────────────────────────────────────────────────────────
check() {
  local label="$1"
  local expected_status="$2"
  local response="$3"

  if [ "$expected_status" = "ok" ]; then
    if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null; then
      pass "$label"
    else
      fail "$label — unexpected response: ${response:0:200}"
    fi
  elif [ "$expected_status" = "204" ]; then
    if [ -z "$response" ] || echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'error' not in d" 2>/dev/null; then
      pass "$label"
    else
      fail "$label — expected empty 204, got: ${response:0:120}"
    fi
  else
    local actual_code
    actual_code=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('code','OK'))" 2>/dev/null || echo "PARSE_ERROR")
    if [ "$actual_code" = "$expected_status" ]; then
      pass "$label (got $actual_code)"
    else
      fail "$label — expected $expected_status, got: ${response:0:200}"
    fi
  fi
}

extract() {
  local json="$1"
  local key="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['$key'])" 2>/dev/null || echo ""
}

# ── §7.6 Creator Events — List & Create ───────────────────────────────────────
section "GET /api/v1/creator/events — list events"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/events")
check "GET events returns array" "ok" "$R"

section "POST /api/v1/creator/events — create event"

R=$(curl -s -X POST "$BASE/creator/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Seminar de Fitness",
    "description": "Un taller de fitness avanzado",
    "date": "2026-06-15T10:00:00.000Z",
    "location": "Bogotá, Colombia",
    "maxRegistrations": 10,
    "fields": [
      {"fieldName": "Número de teléfono", "fieldType": "text", "required": false},
      {"fieldName": "Nivel de experiencia", "fieldType": "select", "required": false}
    ]
  }')
check "POST event returns eventId" "ok" "$R"

EVENT_ID=$(extract "$R" "eventId")
if [ -z "$EVENT_ID" ]; then
  fail "Could not extract eventId"
  exit 1
fi
pass "eventId extracted: $EVENT_ID"

R=$(curl -s -X POST "$BASE/creator/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "sin titulo"}')
check "POST event without title returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

R=$(curl -s -X POST "$BASE/creator/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Sin fecha"}')
check "POST event without date returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# ── §7.6 Creator Events — Update & Status ─────────────────────────────────────
section "PATCH /api/v1/creator/events/:eventId — update event"

R=$(curl -s -X PATCH "$BASE/creator/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Seminar de Fitness Avanzado", "location": "Medellín, Colombia"}')
check "PATCH event title/location" "ok" "$R"

R=$(curl -s -X PATCH "$BASE/creator/events/nonexistent-event-id" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "X"}')
check "PATCH nonexistent event returns NOT_FOUND" "NOT_FOUND" "$R"

section "PATCH /api/v1/creator/events/:eventId/status — change status"

R=$(curl -s -X PATCH "$BASE/creator/events/$EVENT_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}')
check "PATCH status to active" "ok" "$R"

STATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['status'])" 2>/dev/null)
if [ "$STATUS" = "active" ]; then
  pass "status is active"
else
  fail "Expected status active, got $STATUS"
fi

R=$(curl -s -X PATCH "$BASE/creator/events/$EVENT_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "invalid_status"}')
check "PATCH invalid status returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# ── §8 Public Events — Get Event ──────────────────────────────────────────────
section "GET /api/v1/events/:eventId — public event view"

R=$(curl -s "$BASE/events/$EVENT_ID")
check "GET public event (no auth needed)" "ok" "$R"

TITLE=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['title'])" 2>/dev/null)
if [ -n "$TITLE" ]; then
  pass "Public event has title: $TITLE"
else
  fail "Public event missing title"
fi

SPOTS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['spotsRemaining'])" 2>/dev/null)
if [ "$SPOTS" = "10" ]; then
  pass "spotsRemaining=10 (correct)"
else
  fail "Expected spotsRemaining=10, got $SPOTS"
fi

R=$(curl -s "$BASE/events/nonexistent-event-id")
check "GET nonexistent public event returns NOT_FOUND" "NOT_FOUND" "$R"

# ── §8 Public Events — Register ───────────────────────────────────────────────
section "POST /api/v1/events/:eventId/register — register for event"

FIELD_ID=$(echo "$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/events")" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for ev in d['data']:
    if ev['eventId'] == '${EVENT_ID}':
        if ev['fields']:
            print(ev['fields'][0]['fieldId'])
            break
" 2>/dev/null || echo "")

if [ -n "$FIELD_ID" ]; then
  pass "fieldId extracted: $FIELD_ID"
  R=$(curl -s -X POST "$BASE/events/$EVENT_ID/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"attendee1@test.com\",\"displayName\":\"María García\",\"fieldValues\":{\"${FIELD_ID}\":\"3004567890\"}}")
else
  R=$(curl -s -X POST "$BASE/events/$EVENT_ID/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"attendee1@test.com","displayName":"María García","fieldValues":{}}')
fi
check "POST register returns registrationId + status=registered" "ok" "$R"

REG_STATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['status'])" 2>/dev/null)
if [ "$REG_STATUS" = "registered" ]; then
  pass "status=registered"
else
  fail "Expected status=registered, got $REG_STATUS"
fi

REG_ID=$(extract "$R" "registrationId")
if [ -n "$REG_ID" ]; then
  pass "registrationId extracted: $REG_ID"
else
  fail "Missing registrationId"
fi

R=$(curl -s -X POST "$BASE/events/$EVENT_ID/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"attendee1@test.com","fieldValues":{}}')
check "POST duplicate email returns CONFLICT" "CONFLICT" "$R"

R=$(curl -s -X POST "$BASE/events/$EVENT_ID/register" \
  -H "Content-Type: application/json" \
  -d '{"fieldValues":{}}')
check "POST register without email returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Register more attendees to test waitlist (up to capacity of 10)
for i in 2 3 4 5 6 7 8 9 10; do
  curl -s -X POST "$BASE/events/$EVENT_ID/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"attendee${i}@test.com\",\"displayName\":\"Attendee ${i}\",\"fieldValues\":{}}" > /dev/null
done

section "POST register when at capacity → waitlisted"

R=$(curl -s -X POST "$BASE/events/$EVENT_ID/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"waitlisted@test.com","displayName":"En Espera","fieldValues":{}}')
check "POST register at capacity returns waitlisted status" "ok" "$R"

WAIT_STATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['status'])" 2>/dev/null)
if [ "$WAIT_STATUS" = "waitlisted" ]; then
  pass "status=waitlisted"
else
  fail "Expected status=waitlisted, got $WAIT_STATUS"
fi

WAIT_POS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['waitlistPosition'])" 2>/dev/null)
if [ "$WAIT_POS" = "1" ]; then
  pass "waitlistPosition=1"
else
  fail "Expected waitlistPosition=1, got $WAIT_POS"
fi

WAIT_ID=$(extract "$R" "registrationId")

# ── §7.6 Registrations — List & Check-In ─────────────────────────────────────
section "GET /api/v1/creator/events/:eventId/registrations — list registrations"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/events/$EVENT_ID/registrations")
check "GET registrations returns array" "ok" "$R"

REG_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']))" 2>/dev/null)
if [ "$REG_COUNT" = "10" ]; then
  pass "registrationCount=10 (correct)"
else
  fail "Expected 10 registrations, got $REG_COUNT"
fi

section "POST .../registrations/:registrationId/check-in — check in attendee"

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/events/$EVENT_ID/registrations/$REG_ID/check-in")
check "POST check-in returns checkedInAt" "ok" "$R"

CHECKED_IN_AT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['checkedInAt'])" 2>/dev/null)
if [ -n "$CHECKED_IN_AT" ]; then
  pass "checkedInAt present: $CHECKED_IN_AT"
else
  fail "Missing checkedInAt"
fi

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/events/$EVENT_ID/registrations/$REG_ID/check-in")
check "POST duplicate check-in returns CONFLICT" "CONFLICT" "$R"

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/events/$EVENT_ID/registrations/nonexistent-reg/check-in")
check "POST check-in nonexistent registration returns NOT_FOUND" "NOT_FOUND" "$R"

section "GET registrations?checkedIn=true — filter by check-in status"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/events/$EVENT_ID/registrations?checkedIn=true")
check "GET registrations?checkedIn=true returns filtered list" "ok" "$R"

CHECKED_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']))" 2>/dev/null)
if [ "$CHECKED_COUNT" = "1" ]; then
  pass "checkedIn=true filter returns 1 registration"
else
  fail "Expected 1 checked-in registration, got $CHECKED_COUNT"
fi

# ── §7.6 Waitlist — List & Admit ─────────────────────────────────────────────
section "GET /api/v1/creator/events/:eventId/waitlist — list waitlist"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/events/$EVENT_ID/waitlist")
check "GET waitlist returns array" "ok" "$R"

WAIT_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']))" 2>/dev/null)
if [ "$WAIT_COUNT" = "1" ]; then
  pass "waitlistCount=1 (correct)"
else
  fail "Expected 1 waitlist entry, got $WAIT_COUNT"
fi

FETCHED_WAIT_ID=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['registrationId'])" 2>/dev/null || echo "")

section "POST .../waitlist/:waitlistId/admit — admit waitlist entry"

if [ -n "$FETCHED_WAIT_ID" ]; then
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/events/$EVENT_ID/waitlist/$FETCHED_WAIT_ID/admit")
  check "POST admit waitlist entry returns registrationId" "ok" "$R"

  NEW_REG_ID=$(extract "$R" "registrationId")
  if [ -n "$NEW_REG_ID" ]; then
    pass "New registrationId after admit: $NEW_REG_ID"
  else
    fail "Missing registrationId after admit"
  fi

  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/events/$EVENT_ID/waitlist/$FETCHED_WAIT_ID/admit")
  check "POST admit already-admitted entry returns NOT_FOUND" "NOT_FOUND" "$R"

  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/events/$EVENT_ID/waitlist")
  WAIT_COUNT_AFTER=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']))" 2>/dev/null)
  if [ "$WAIT_COUNT_AFTER" = "0" ]; then
    pass "Waitlist empty after admit"
  else
    fail "Expected 0 waitlist entries after admit, got $WAIT_COUNT_AFTER"
  fi
else
  fail "Could not get waitlist entry ID to test admit"
fi

# ── §7.6 Registrations — Delete ───────────────────────────────────────────────
section "DELETE .../registrations/:registrationId — remove registration"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/events/$EVENT_ID/registrations/$REG_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE registration returns 204"
else
  fail "DELETE registration expected 204, got $HTTP_CODE"
fi

R=$(curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/events/$EVENT_ID/registrations/$REG_ID")
check "DELETE already-deleted registration returns NOT_FOUND" "NOT_FOUND" "$R"

# ── §7.6 Event — Closed status blocks updates ─────────────────────────────────
section "PATCH closed event returns CONFLICT"

R=$(curl -s -X PATCH "$BASE/creator/events/$EVENT_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "closed"}')
check "PATCH status to closed" "ok" "$R"

R=$(curl -s -X PATCH "$BASE/creator/events/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Update blocked"}')
check "PATCH closed event returns CONFLICT" "CONFLICT" "$R"

# ── §8 Public Events — Draft not visible ──────────────────────────────────────
section "Create draft event and verify not public"

R=$(curl -s -X POST "$BASE/creator/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Draft Event", "date": "2026-07-01T10:00:00.000Z"}')
DRAFT_EVENT_ID=$(extract "$R" "eventId")

R=$(curl -s "$BASE/events/$DRAFT_EVENT_ID")
check "GET draft event returns NOT_FOUND to public" "NOT_FOUND" "$R"

# ── §8 Public Events — Closed event blocks registration ───────────────────────
section "POST register on closed event returns FORBIDDEN"

R=$(curl -s -X POST "$BASE/events/$EVENT_ID/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"late@test.com","fieldValues":{}}')
check "POST register on closed event returns FORBIDDEN" "FORBIDDEN" "$R"

# ── §7.6 Delete events — cleanup ──────────────────────────────────────────────
section "DELETE /api/v1/creator/events/:eventId — delete event with registrations blocked"

R=$(curl -s -X PATCH "$BASE/creator/events/$EVENT_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}')

R=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/creator/events/$EVENT_ID")
check "DELETE event with registrations returns CONFLICT" "CONFLICT" "$R"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/events/$DRAFT_EVENT_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE draft event returns 204"
else
  fail "DELETE draft event expected 204, got $HTTP_CODE"
fi

R=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/creator/events/nonexistent-event-id")
check "DELETE nonexistent event returns NOT_FOUND" "NOT_FOUND" "$R"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed!${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed.${RESET}"
  exit 1
fi
