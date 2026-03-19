#!/usr/bin/env bash
# test-payments-api.sh — §10 Payments + subscriptions endpoint tests
# Usage: bash scripts/test-payments-api.sh <email> <password>

set -euo pipefail

BASE="${BASE:-http://127.0.0.1:5001/wolf-20b8b/us-central1/api/v1}"
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

echo -e "${BOLD}Wake — Payments API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-payments-api.sh <email> <password>"
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
  local actual_code
  actual_code=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('code','OK'))" 2>/dev/null || echo "PARSE_ERROR")

  if [ "$expected_status" = "ok" ]; then
    if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null; then
      pass "$label"
    else
      fail "$label — unexpected response: ${response:0:200}"
    fi
  elif [ "$expected_status" = "201" ]; then
    if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null; then
      pass "$label"
    else
      fail "$label — expected 201 with data, got: ${response:0:200}"
    fi
  else
    if [ "$actual_code" = "$expected_status" ]; then
      pass "$label (got $actual_code)"
    else
      fail "$label — expected $expected_status, got: ${response:0:200}"
    fi
  fi
}

# ── 1. GET /users/me/subscriptions ───────────────────────────────────────────
section "GET /api/v1/users/me/subscriptions"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/users/me/subscriptions")
check "GET subscriptions returns array" "ok" "$R"
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")
echo "       subscriptions found: $COUNT"

# No auth
R=$(curl -s "$BASE/users/me/subscriptions")
check "GET subscriptions no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 2. POST /payments/preference — validation errors ─────────────────────────
section "POST /api/v1/payments/preference — validation"

# Missing courseId
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE/payments/preference")
check "POST preference missing courseId returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Non-existent course
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"nonexistent-course-xyz-abc"}' \
  "$BASE/payments/preference")
check "POST preference nonexistent course returns NOT_FOUND" "NOT_FOUND" "$R"

# No auth
R=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"courseId":"any"}' \
  "$BASE/payments/preference")
check "POST preference no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 3. POST /payments/subscription — validation errors ───────────────────────
section "POST /api/v1/payments/subscription — validation"

# Missing courseId
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"payerEmail":"test@test.com"}' \
  "$BASE/payments/subscription")
check "POST subscription missing courseId returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Missing payerEmail
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"some-course"}' \
  "$BASE/payments/subscription")
check "POST subscription missing payerEmail returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Non-existent course
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"nonexistent-course-xyz-abc","payerEmail":"test@test.com"}' \
  "$BASE/payments/subscription")
check "POST subscription nonexistent course returns NOT_FOUND" "NOT_FOUND" "$R"

# No auth
R=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"courseId":"any","payerEmail":"x@x.com"}' \
  "$BASE/payments/subscription")
check "POST subscription no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 4. POST /payments/subscriptions/:id/cancel — validation errors ────────────
section "POST /api/v1/payments/subscriptions/:id/cancel — validation"

# Invalid action
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"delete"}' \
  "$BASE/payments/subscriptions/nonexistent-sub-id/cancel")
check "POST cancel invalid action returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Non-existent subscription
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"cancel"}' \
  "$BASE/payments/subscriptions/nonexistent-sub-id-xyz/cancel")
check "POST cancel nonexistent subscription returns NOT_FOUND" "NOT_FOUND" "$R"

# No auth
R=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"action":"cancel"}' \
  "$BASE/payments/subscriptions/any-sub-id/cancel")
check "POST cancel no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 5. POST /payments/webhook — signature validation ─────────────────────────
section "POST /api/v1/payments/webhook — signature check"

# No signature — should return 403 (secret available) or 500 (emulator without secrets)
R_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","action":"payment.created","data":{"id":"123"}}' \
  "$BASE/payments/webhook")
if [ "$R_STATUS" = "403" ] || [ "$R_STATUS" = "500" ]; then
  pass "POST webhook no signature returns $R_STATUS (403=valid sig, 500=no secret in emulator)"
else
  fail "POST webhook no signature — expected 403 or 500, got $R_STATUS"
fi

# Unknown webhook type (with any x-signature) — emulator may not have secrets
# This tests the routing exists, not signature validity
R_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "x-signature: ts=0,v1=invalid" \
  -H "x-request-id: test-req-id" \
  -d '{"type":"unknown_type","data":{"id":"test"}}' \
  "$BASE/payments/webhook")
if [ "$R_STATUS" = "403" ] || [ "$R_STATUS" = "500" ] || [ "$R_STATUS" = "200" ]; then
  pass "POST webhook with invalid signature returns expected status ($R_STATUS)"
else
  fail "POST webhook — unexpected status $R_STATUS"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────${RESET}"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed${RESET}"
  exit 1
fi
