#!/usr/bin/env bash
# test-bookings-api.sh — §7.7 Creator Availability + §9 PWA Bookings endpoint tests
# Usage: bash scripts/test-bookings-api.sh <email> <password>

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

echo -e "${BOLD}Wake — Creator Availability + PWA Bookings API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-bookings-api.sh <email> <password>"
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

USER_ID=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('localId',''))" 2>/dev/null)
pass "userId: $USER_ID"

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

# ── §7.7 Creator Availability — GET ───────────────────────────────────────────
section "GET /api/v1/creator/availability — get full availability"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/availability")
check "GET availability returns data" "ok" "$R"

# ── §7.7 Creator Availability — Add Slots ─────────────────────────────────────
section "POST /api/v1/creator/availability/slots — add slots"

# Use a date in 2026
SLOT_DATE="2026-06-20"

R=$(curl -s -X POST "$BASE/creator/availability/slots" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"date\": \"${SLOT_DATE}\",
    \"startTime\": \"09:00\",
    \"endTime\": \"11:00\",
    \"durationMinutes\": 60,
    \"timezone\": \"America/Bogota\"
  }")
check "POST availability slots returns slotsCreated" "ok" "$R"

SLOTS_CREATED=$(extract "$R" "slotsCreated")
if [ "$SLOTS_CREATED" = "2" ]; then
  pass "slotsCreated=2 (09:00 and 10:00)"
else
  fail "Expected 2 slots created, got $SLOTS_CREATED"
fi

R=$(curl -s -X POST "$BASE/creator/availability/slots" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
check "POST slots without date returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

section "GET availability — verify slots created"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/availability")
check "GET availability after adding slots" "ok" "$R"

HAS_DATE=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
days = d.get('data', {}).get('days', {})
print('yes' if '${SLOT_DATE}' in days else 'no')
" 2>/dev/null || echo "no")

if [ "$HAS_DATE" = "yes" ]; then
  pass "Availability has date ${SLOT_DATE}"
else
  fail "Availability missing date ${SLOT_DATE}"
fi

SLOT_COUNT=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
days = d.get('data', {}).get('days', {})
slots = days.get('${SLOT_DATE}', {}).get('slots', [])
print(len(slots))
" 2>/dev/null || echo "0")

if [ "$SLOT_COUNT" = "2" ]; then
  pass "Slot count=2 for ${SLOT_DATE}"
else
  fail "Expected 2 slots for ${SLOT_DATE}, got $SLOT_COUNT"
fi

# Extract first slot's startUtc
SLOT_START_UTC=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
days = d.get('data', {}).get('days', {})
slots = days.get('${SLOT_DATE}', {}).get('slots', [])
print(slots[0]['startUtc'] if slots else '')
" 2>/dev/null || echo "")

SLOT_END_UTC=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
days = d.get('data', {}).get('days', {})
slots = days.get('${SLOT_DATE}', {}).get('slots', [])
print(slots[0]['endUtc'] if slots else '')
" 2>/dev/null || echo "")

if [ -n "$SLOT_START_UTC" ]; then
  pass "First slot startUtc: $SLOT_START_UTC"
else
  fail "Could not extract slot startUtc"
fi

# ── §9 PWA Bookings — Creator Availability ────────────────────────────────────
section "GET /api/v1/creator/:creatorId/availability — PWA view"

R=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/$USER_ID/availability?startDate=2026-06-01&endDate=2026-06-30")
check "GET creator availability for PWA returns data" "ok" "$R"

AVA_SLOTS=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
days = d.get('data', {}).get('days', {})
day = days.get('${SLOT_DATE}', {})
slots = day.get('availableSlots', [])
print(len(slots))
" 2>/dev/null || echo "0")

if [ "$AVA_SLOTS" = "2" ]; then
  pass "PWA sees 2 available slots on ${SLOT_DATE}"
else
  fail "Expected 2 available slots, got $AVA_SLOTS"
fi

R=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/$USER_ID/availability?startDate=2026-06-01&endDate=2027-09-01")
check "GET with range >60 days returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

R=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/nonexistent-creator-id/availability?startDate=2026-06-01&endDate=2026-06-30")
check "GET nonexistent creator returns NOT_FOUND" "NOT_FOUND" "$R"

R=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/$USER_ID/availability")
check "GET without startDate returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# ── §9 PWA Bookings — Create Booking ──────────────────────────────────────────
section "POST /api/v1/bookings — book a slot"

if [ -z "$SLOT_START_UTC" ]; then
  fail "Cannot test booking — slot startUtc not available"
else
  R=$(curl -s -X POST "$BASE/bookings" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"creatorId\": \"${USER_ID}\",
      \"slotStartUtc\": \"${SLOT_START_UTC}\",
      \"slotEndUtc\": \"${SLOT_END_UTC}\"
    }")
  check "POST bookings returns bookingId + status=scheduled" "ok" "$R"

  BOOKING_STATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['status'])" 2>/dev/null)
  if [ "$BOOKING_STATUS" = "scheduled" ]; then
    pass "status=scheduled"
  else
    fail "Expected status=scheduled, got $BOOKING_STATUS"
  fi

  BOOKING_ID=$(extract "$R" "bookingId")
  if [ -n "$BOOKING_ID" ]; then
    pass "bookingId: $BOOKING_ID"
  else
    fail "Missing bookingId"
  fi

  R=$(curl -s -X POST "$BASE/bookings" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"creatorId\": \"${USER_ID}\",
      \"slotStartUtc\": \"${SLOT_START_UTC}\",
      \"slotEndUtc\": \"${SLOT_END_UTC}\"
    }")
  check "POST duplicate booking returns CONFLICT" "CONFLICT" "$R"

  R=$(curl -s -X POST "$BASE/bookings" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "creatorId": "nonexistent-creator",
      "slotStartUtc": "2026-06-20T14:00:00.000Z",
      "slotEndUtc": "2026-06-20T15:00:00.000Z"
    }')
  check "POST booking with nonexistent creator returns NOT_FOUND" "NOT_FOUND" "$R"

  R=$(curl -s -X POST "$BASE/bookings" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"creatorId\": \"${USER_ID}\",
      \"slotStartUtc\": \"2026-06-20T23:00:00.000Z\",
      \"slotEndUtc\": \"2026-06-20T23:59:00.000Z\"
    }")
  check "POST booking for nonexistent slot returns NOT_FOUND" "NOT_FOUND" "$R"

  R=$(curl -s -X POST "$BASE/bookings" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"slotStartUtc": "2026-06-20T14:00:00.000Z"}')
  check "POST booking without creatorId returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

  # ── §7.7 Creator Bookings — List ──────────────────────────────────────────────
  section "GET /api/v1/creator/bookings — list creator bookings"

  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/bookings")
  check "GET creator bookings returns array" "ok" "$R"

  BOOKING_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']))" 2>/dev/null)
  if [ "$BOOKING_COUNT" -ge 1 ]; then
    pass "Creator has at least 1 booking"
  else
    fail "Expected at least 1 booking, got $BOOKING_COUNT"
  fi

  section "GET /api/v1/creator/bookings?date=... — filter by date"

  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/bookings?date=$SLOT_DATE")
  check "GET creator bookings filtered by date" "ok" "$R"

  section "PATCH /api/v1/creator/bookings/:bookingId — add call link"

  R=$(curl -s -X PATCH "$BASE/creator/bookings/$BOOKING_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"callLink": "https://meet.google.com/abc-def-ghi"}')
  check "PATCH booking adds callLink" "ok" "$R"

  R=$(curl -s -X PATCH "$BASE/creator/bookings/nonexistent-booking-id" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"callLink": "https://meet.example.com"}')
  check "PATCH nonexistent booking returns NOT_FOUND" "NOT_FOUND" "$R"

  # ── §9 PWA Bookings — Get Single ─────────────────────────────────────────────
  section "GET /api/v1/bookings/:bookingId — get booking"

  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/bookings/$BOOKING_ID")
  check "GET booking returns data" "ok" "$R"

  CALL_LINK=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['callLink'])" 2>/dev/null)
  if [ "$CALL_LINK" = "https://meet.google.com/abc-def-ghi" ]; then
    pass "callLink present and correct"
  else
    fail "Expected callLink, got $CALL_LINK"
  fi

  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/bookings/nonexistent-booking-id")
  check "GET nonexistent booking returns NOT_FOUND" "NOT_FOUND" "$R"

  # ── §9 PWA Bookings — Delete/Cancel ──────────────────────────────────────────
  section "DELETE /api/v1/bookings/:bookingId — cancel booking"

  R=$(curl -s -X DELETE -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/bookings/$BOOKING_ID")
  HTTP_CODE=$(echo "$R" | tail -1)
  if [ "$HTTP_CODE" = "204" ]; then
    pass "DELETE booking returns 204"
  else
    fail "DELETE booking expected 204, got $HTTP_CODE"
  fi

  # After cancel, slot should be available again
  section "Verify slot re-opens after booking cancel"

  R=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/$USER_ID/availability?startDate=2026-06-01&endDate=2026-06-30")
  check "GET creator availability after cancel" "ok" "$R"

  AVA_AFTER=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
days = d.get('data', {}).get('days', {})
day = days.get('${SLOT_DATE}', {})
slots = day.get('availableSlots', [])
print(len(slots))
" 2>/dev/null || echo "0")

  if [ "$AVA_AFTER" = "2" ]; then
    pass "Slot re-opened after cancel (2 available)"
  else
    fail "Expected 2 available slots after cancel, got $AVA_AFTER"
  fi

  R=$(curl -s -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/bookings/nonexistent-booking-id")
  check "DELETE nonexistent booking returns NOT_FOUND" "NOT_FOUND" "$R"
fi

# ── §7.7 Delete all slots for a day ───────────────────────────────────────────
section "DELETE /api/v1/creator/availability/slots — delete all slots for day"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"date\": \"${SLOT_DATE}\", \"startUtc\": null}" \
  "$BASE/creator/availability/slots")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE all slots for day returns 204"
else
  fail "DELETE slots expected 204, got $HTTP_CODE"
fi

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/availability")
HAS_DATE_AFTER=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
days = d.get('data', {}).get('days', {})
print('yes' if '${SLOT_DATE}' in days else 'no')
" 2>/dev/null || echo "err")

if [ "$HAS_DATE_AFTER" = "no" ]; then
  pass "Date ${SLOT_DATE} removed from availability"
else
  fail "Expected date ${SLOT_DATE} removed, but still present"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed!${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed.${RESET}"
  exit 1
fi
