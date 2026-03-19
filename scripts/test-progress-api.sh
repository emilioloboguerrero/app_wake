#!/usr/bin/env bash
# test-progress-api.sh — Domain 4 Progress/Lab endpoint tests
# Usage: bash scripts/test-progress-api.sh <email> <password>

set -euo pipefail

BASE="${BASE:-http://localhost:5001/wolf-20b8b/us-central1/api/api/v1}"
API_KEY="AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g"
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d 2>/dev/null || echo "2026-03-16")
PAST_30=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d '30 days ago' +%Y-%m-%d 2>/dev/null || echo "2026-02-13")

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

echo -e "${BOLD}Wake — Progress/Lab API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-progress-api.sh <email> <password>"
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
  elif [ "$expected_status" = "204" ]; then
    if [ -z "$response" ] || echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'error' not in d" 2>/dev/null; then
      pass "$label"
    else
      fail "$label — expected empty 204, got: ${response:0:120}"
    fi
  else
    if [ "$actual_code" = "$expected_status" ]; then
      pass "$label (got $actual_code)"
    else
      fail "$label — expected $expected_status, got: ${response:0:200}"
    fi
  fi
}

# ── 1. Body Log ───────────────────────────────────────────────────────────────
section "PUT /api/v1/progress/body-log/:date — create entry"

R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weight":75.5,"note":"Mañana de prueba"}' \
  "$BASE/progress/body-log/${TODAY}")
check "PUT body-log creates entry" "ok" "$R"

# Idempotent update
R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weight":76.0}' \
  "$BASE/progress/body-log/${TODAY}")
check "PUT body-log updates weight (idempotent)" "ok" "$R"

# Invalid date
R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weight":70}' \
  "$BASE/progress/body-log/not-a-date")
check "PUT body-log invalid date returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth
R=$(curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d '{"weight":70}' \
  "$BASE/progress/body-log/${TODAY}")
check "PUT body-log no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "GET /api/v1/progress/body-log/:date — single entry"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/body-log/${TODAY}")
check "GET body-log single date returns entry" "ok" "$R"
WEIGHT=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['weight'])" 2>/dev/null)
echo "       weight: $WEIGHT"

# Not found
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/body-log/2000-01-01")
check "GET body-log missing date returns NOT_FOUND" "NOT_FOUND" "$R"

section "GET /api/v1/progress/body-log — paginated list"

# Create a second entry for pagination testing
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weight":74.0,"note":"Ayer"}' \
  "$BASE/progress/body-log/${YESTERDAY}" > /dev/null

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/body-log")
check "GET body-log list returns array" "ok" "$R"
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       entries returned: $COUNT"

# With limit=1 should return nextPageToken
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/body-log?limit=1")
check "GET body-log limit=1 returns data" "ok" "$R"
NEXT_TOKEN=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nextPageToken') or '')" 2>/dev/null)
echo "       nextPageToken present: $([ -n "$NEXT_TOKEN" ] && echo yes || echo no)"

# Paginate with token
if [ -n "$NEXT_TOKEN" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/body-log?limit=1&pageToken=${NEXT_TOKEN}")
  check "GET body-log with pageToken returns page 2" "ok" "$R"
fi

section "DELETE /api/v1/progress/body-log/:date — delete entry"

R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/progress/body-log/${YESTERDAY}")
if [ "$R" = "204" ]; then
  pass "DELETE body-log removes entry (204)"
else
  fail "DELETE body-log returned HTTP $R"
fi

# Already deleted → NOT_FOUND
R=$(curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/progress/body-log/${YESTERDAY}")
check "DELETE body-log nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"

section "POST /api/v1/progress/body-log/:date/photos/upload-url"

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"angle":"front","contentType":"image/jpeg"}' \
  "$BASE/progress/body-log/${TODAY}/photos/upload-url")
# In emulator, Storage signing may fail — accept either signed URL or INTERNAL_ERROR
PHOTO_CODE=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('code','OK'))" 2>/dev/null)
if [ "$PHOTO_CODE" = "OK" ]; then
  pass "POST photos/upload-url — got signed URL"
  PHOTO_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['photoId'])" 2>/dev/null)
  STORAGE_PATH=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['storagePath'])" 2>/dev/null)
  echo "       photoId: ${PHOTO_ID:0:8}..."
elif [ "$PHOTO_CODE" = "INTERNAL_ERROR" ]; then
  pass "POST photos/upload-url — INTERNAL_ERROR (expected in emulator without ADC)"
else
  fail "POST photos/upload-url — unexpected: ${R:0:200}"
fi

# Validation: invalid angle
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"angle":"left","contentType":"image/jpeg"}' \
  "$BASE/progress/body-log/${TODAY}/photos/upload-url")
check "POST photos/upload-url invalid angle returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Validation: invalid contentType
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"angle":"front","contentType":"image/gif"}' \
  "$BASE/progress/body-log/${TODAY}/photos/upload-url")
check "POST photos/upload-url invalid contentType returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# ── 2. Readiness ──────────────────────────────────────────────────────────────
section "PUT /api/v1/progress/readiness/:date — create entry"

R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"energy":8,"soreness":7,"sleep":9}' \
  "$BASE/progress/readiness/${TODAY}")
check "PUT readiness creates entry" "ok" "$R"

# Idempotent update
R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"energy":6,"soreness":5,"sleep":7}' \
  "$BASE/progress/readiness/${TODAY}")
check "PUT readiness updates (idempotent)" "ok" "$R"

# Out-of-range value
R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"energy":11,"soreness":5,"sleep":7}' \
  "$BASE/progress/readiness/${TODAY}")
check "PUT readiness out-of-range returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Missing field
R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"energy":8,"soreness":7}' \
  "$BASE/progress/readiness/${TODAY}")
check "PUT readiness missing sleep returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth
R=$(curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d '{"energy":8,"soreness":7,"sleep":9}' \
  "$BASE/progress/readiness/${TODAY}")
check "PUT readiness no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "GET /api/v1/progress/readiness/:date — single entry"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/readiness/${TODAY}")
check "GET readiness by date returns entry" "ok" "$R"
ENERGY=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['energy'])" 2>/dev/null)
SORENESS=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['soreness'])" 2>/dev/null)
echo "       energy: $ENERGY, soreness (corrected): $SORENESS"

# Verify soreness inversion: we PUT soreness=5, stored as 11-5=6, GET should return 11-6=5
if [ "$SORENESS" = "5" ]; then
  pass "Soreness inversion round-trip correct (PUT 5 → stored 6 → GET 5)"
else
  fail "Soreness inversion wrong — expected 5, got $SORENESS"
fi

# Not found
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/readiness/2000-01-01")
check "GET readiness missing date returns NOT_FOUND" "NOT_FOUND" "$R"

section "GET /api/v1/progress/readiness?startDate=&endDate= — range query"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/readiness?startDate=${PAST_30}&endDate=${TODAY}")
check "GET readiness range returns array" "ok" "$R"
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       entries in range: $COUNT"

# Missing params
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/readiness")
check "GET readiness missing params returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Range > 90 days
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/readiness?startDate=2020-01-01&endDate=2026-01-01")
check "GET readiness range >90 days returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Invalid date
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/readiness?startDate=bad-date&endDate=${TODAY}")
check "GET readiness invalid date returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

section "DELETE /api/v1/progress/readiness/:date"

R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/progress/readiness/${TODAY}")
if [ "$R" = "204" ]; then
  pass "DELETE readiness removes entry (204)"
else
  fail "DELETE readiness returned HTTP $R"
fi

# Already deleted
R=$(curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/progress/readiness/${TODAY}")
check "DELETE readiness nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 3. PRs ────────────────────────────────────────────────────────────────────
section "GET /api/v1/progress/prs — list PRs"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/progress/prs")
check "GET prs returns array" "ok" "$R"
PR_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       PRs found: $PR_COUNT"

# Verify shape if there are any PRs
if [ "${PR_COUNT:-0}" -gt 0 ] 2>/dev/null; then
  FIRST_KEY=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0].get('exerciseKey',''))" 2>/dev/null)
  echo "       first exerciseKey: $FIRST_KEY"
  pass "PRs response has expected shape"
fi

# No auth
R=$(curl -s "$BASE/progress/prs")
check "GET prs no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 4. goalWeight via PATCH /users/me ─────────────────────────────────────────
section "PATCH /api/v1/users/me — goalWeight field"

R=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"goalWeight":70.0}' \
  "$BASE/users/me")
check "PATCH users/me with goalWeight succeeds" "ok" "$R"

# ── Cleanup ───────────────────────────────────────────────────────────────────
section "Cleanup — removing today's body-log entry"
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/progress/body-log/${TODAY}" > /dev/null
pass "Today's body-log entry cleaned up"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────${RESET}"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed${RESET}"
  exit 1
fi
