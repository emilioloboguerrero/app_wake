#!/usr/bin/env bash
# test-creator-api.sh — Domain 7 Creator endpoint tests
# Usage: bash scripts/test-creator-api.sh <email> <password>

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

echo -e "${BOLD}Wake — Creator API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-creator-api.sh <email> <password>"
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

# ── 7.1 Client Management ─────────────────────────────────────────────────────
section "GET /api/v1/creator/clients — list clients"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients")
check "GET clients returns array" "ok" "$R"
CLIENT_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       clients returned: $CLIENT_COUNT"
HAS_MORE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hasMore',False))" 2>/dev/null)
echo "       hasMore: $HAS_MORE"

# No auth
R=$(curl -s "$BASE/creator/clients")
check "GET clients no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "POST /api/v1/creator/clients — add client by email"

# Missing email
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE/creator/clients")
check "POST clients missing email returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Non-existent email
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent-user-xyz-123@example.com"}' \
  "$BASE/creator/clients")
check "POST clients unknown email returns NOT_FOUND" "NOT_FOUND" "$R"

# No auth
R=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' \
  "$BASE/creator/clients")
check "POST clients no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "GET /api/v1/creator/clients/:clientId — single client"

# Non-existent client
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/nonexistent-client-id-xyz")
check "GET client nonexistent returns FORBIDDEN" "FORBIDDEN" "$R"

# Extract first client ID if any exist
FIRST_CLIENT_ID=""
R_LIST=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients")
FIRST_CLIENT_ID=$(echo "$R_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['clientId'] if d else '')" 2>/dev/null)
echo "       first clientId: ${FIRST_CLIENT_ID:0:20}..."

if [ -n "$FIRST_CLIENT_ID" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT_ID")
  check "GET client by ID returns profile" "ok" "$R"
  CLIENT_DISPLAY=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('displayName',''))" 2>/dev/null)
  echo "       displayName: $CLIENT_DISPLAY"
fi

section "DELETE /api/v1/creator/clients/:clientId — remove client"

# Non-existent
R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/clients/nonexistent-client-xyz")
if [ "$R" = "403" ] || [ "$R" = "404" ]; then
  pass "DELETE client nonexistent returns 403/404 (got HTTP $R)"
else
  fail "DELETE client nonexistent — expected 403/404, got HTTP $R"
fi

# ── 7.2 Client Workout Data ───────────────────────────────────────────────────
section "GET /api/v1/creator/clients/:clientId/workout/sessions"

if [ -n "$FIRST_CLIENT_ID" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT_ID/workout/sessions")
  check "GET client sessions returns array" "ok" "$R"
  SESSION_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
  echo "       sessions returned: $SESSION_COUNT"
fi

# Unauthorized client
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/unauthorized-user-xyz/workout/sessions")
check "GET client sessions unauthorized returns FORBIDDEN" "FORBIDDEN" "$R"

# No auth
R=$(curl -s "$BASE/creator/clients/some-id/workout/sessions")
check "GET client sessions no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "GET /api/v1/creator/clients/:clientId/progress/body-log"

if [ -n "$FIRST_CLIENT_ID" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT_ID/progress/body-log")
  check "GET client body-log returns array" "ok" "$R"
fi

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/unauthorized-xyz/progress/body-log")
check "GET client body-log unauthorized returns FORBIDDEN" "FORBIDDEN" "$R"

section "GET /api/v1/creator/clients/:clientId/progress/readiness"

if [ -n "$FIRST_CLIENT_ID" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT_ID/progress/readiness")
  check "GET client readiness returns array" "ok" "$R"
fi

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/unauthorized-xyz/progress/readiness")
check "GET client readiness unauthorized returns FORBIDDEN" "FORBIDDEN" "$R"

# ── 7.3 Creator Library — Sessions ───────────────────────────────────────────
section "GET/POST /api/v1/creator/library/sessions"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/sessions")
check "GET library sessions returns array" "ok" "$R"
SESSION_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       library sessions: $SESSION_COUNT"

# Create a session
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Library Session"}' \
  "$BASE/creator/library/sessions")
check "POST library sessions creates session" "ok" "$R"
NEW_SESSION_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('sessionId',''))" 2>/dev/null)
echo "       created sessionId: $NEW_SESSION_ID"

# Missing title
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE/creator/library/sessions")
check "POST library sessions missing title returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth
R=$(curl -s "$BASE/creator/library/sessions")
check "GET library sessions no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "GET/PATCH/DELETE /api/v1/creator/library/sessions/:sessionId"

if [ -n "$NEW_SESSION_ID" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/sessions/$NEW_SESSION_ID")
  check "GET library session by ID returns session" "ok" "$R"
  TITLE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('title',''))" 2>/dev/null)
  echo "       title: $TITLE"

  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Updated Library Session"}' \
    "$BASE/creator/library/sessions/$NEW_SESSION_ID")
  check "PATCH library session updates title" "ok" "$R"

  # Verify update persisted
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/sessions/$NEW_SESSION_ID")
  UPDATED_TITLE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('title',''))" 2>/dev/null)
  if [ "$UPDATED_TITLE" = "Updated Library Session" ]; then
    pass "PATCH library session — GET confirms update persisted"
  else
    fail "PATCH library session — GET returned title: '$UPDATED_TITLE'"
  fi

  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/library/sessions/$NEW_SESSION_ID")
  if [ "$R" = "204" ]; then
    pass "DELETE library session (204)"
  else
    fail "DELETE library session returned HTTP $R"
  fi

  # Confirm deleted
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/sessions/$NEW_SESSION_ID")
  check "GET deleted session returns NOT_FOUND" "NOT_FOUND" "$R"
fi

# Not found
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/sessions/nonexistent-session-xyz")
check "GET nonexistent library session returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 7.3 Creator Library — Modules ────────────────────────────────────────────
section "GET/POST /api/v1/creator/library/modules"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/modules")
check "GET library modules returns array" "ok" "$R"
MODULE_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       library modules: $MODULE_COUNT"

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Library Module"}' \
  "$BASE/creator/library/modules")
check "POST library modules creates module" "ok" "$R"
NEW_MODULE_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('moduleId',''))" 2>/dev/null)
echo "       created moduleId: $NEW_MODULE_ID"

# Missing title
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE/creator/library/modules")
check "POST library modules missing title returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

section "GET/PATCH/DELETE /api/v1/creator/library/modules/:moduleId"

if [ -n "$NEW_MODULE_ID" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/modules/$NEW_MODULE_ID")
  check "GET library module by ID returns module" "ok" "$R"
  TITLE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('title',''))" 2>/dev/null)
  echo "       title: $TITLE"

  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Updated Library Module"}' \
    "$BASE/creator/library/modules/$NEW_MODULE_ID")
  check "PATCH library module updates title" "ok" "$R"

  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/library/modules/$NEW_MODULE_ID")
  if [ "$R" = "204" ]; then
    pass "DELETE library module (204)"
  else
    fail "DELETE library module returned HTTP $R"
  fi
fi

# Not found
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/modules/nonexistent-module-xyz")
check "GET nonexistent library module returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 7.4 Availability ─────────────────────────────────────────────────────────
section "GET /api/v1/creator/availability"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/availability")
check "GET availability returns data" "ok" "$R"
TZ=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('timezone',''))" 2>/dev/null)
echo "       timezone: $TZ"

# No auth
R=$(curl -s "$BASE/creator/availability")
check "GET availability no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "POST /api/v1/creator/availability/slots — add slots"

TODAY=$(date -u +%Y-%m-%d)

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$TODAY\",\"startTime\":\"09:00\",\"endTime\":\"11:00\",\"durationMinutes\":30,\"timezone\":\"America/Bogota\"}" \
  "$BASE/creator/availability/slots")
check "POST availability/slots creates slots" "ok" "$R"
SLOTS_CREATED=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('slotsCreated',0))" 2>/dev/null)
echo "       slotsCreated: $SLOTS_CREATED"
if [ "$SLOTS_CREATED" = "4" ]; then
  pass "POST availability/slots — correct count (4 x 30min in 2h)"
else
  fail "POST availability/slots — expected 4 slots, got $SLOTS_CREATED"
fi

# Verify persisted
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/availability")
DAY_SLOTS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']['days']; slots=d.get('$TODAY',{}).get('slots',[]); print(len(slots))" 2>/dev/null)
if [ "$DAY_SLOTS" = "4" ]; then
  pass "GET availability — 4 slots persisted for $TODAY"
else
  fail "GET availability — expected 4 slots, got $DAY_SLOTS"
fi

# Missing fields
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-03-20"}' \
  "$BASE/creator/availability/slots")
check "POST availability/slots missing fields returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Invalid time order
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$TODAY\",\"startTime\":\"12:00\",\"endTime\":\"09:00\",\"durationMinutes\":30,\"timezone\":\"UTC\"}" \
  "$BASE/creator/availability/slots")
check "POST availability/slots startTime after endTime returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

section "DELETE /api/v1/creator/availability/slots — remove slots"

# Delete specific slot
FIRST_SLOT_START=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/availability" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']['days']; slots=d.get('$TODAY',{}).get('slots',[]); print(slots[0]['startUtc'] if slots else '')" 2>/dev/null)

if [ -n "$FIRST_SLOT_START" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"date\":\"$TODAY\",\"startUtc\":\"$FIRST_SLOT_START\"}" \
    "$BASE/creator/availability/slots")
  if [ "$R" = "204" ]; then
    pass "DELETE specific slot (204)"
  else
    fail "DELETE specific slot returned HTTP $R"
  fi
fi

# Delete all slots for day
R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$TODAY\"}" \
  "$BASE/creator/availability/slots")
if [ "$R" = "204" ]; then
  pass "DELETE all slots for day (204)"
else
  fail "DELETE all slots returned HTTP $R"
fi

# Verify cleared
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/availability")
REMAINING=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']['days']; print(len(d.get('$TODAY',{}).get('slots',[])))" 2>/dev/null)
if [ "$REMAINING" = "0" ]; then
  pass "GET availability after delete — no slots for $TODAY"
else
  fail "GET availability after delete — expected 0 slots, got $REMAINING"
fi

# ── 7.4 Bookings ─────────────────────────────────────────────────────────────
section "GET /api/v1/creator/bookings"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/bookings")
check "GET bookings returns array" "ok" "$R"
BOOKING_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       bookings returned: $BOOKING_COUNT"

# Date filter
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/bookings?date=$TODAY")
check "GET bookings with date filter returns array" "ok" "$R"

# No auth
R=$(curl -s "$BASE/creator/bookings")
check "GET bookings no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "PATCH /api/v1/creator/bookings/:bookingId"

# Not found
R=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"callLink":"https://meet.google.com/abc-def"}' \
  "$BASE/creator/bookings/nonexistent-booking-xyz")
check "PATCH nonexistent booking returns NOT_FOUND" "NOT_FOUND" "$R"

# No auth
R=$(curl -s -X PATCH \
  -H "Content-Type: application/json" \
  -d '{"callLink":"https://example.com"}' \
  "$BASE/creator/bookings/any")
check "PATCH booking no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────${RESET}"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed${RESET}"
  exit 1
fi
