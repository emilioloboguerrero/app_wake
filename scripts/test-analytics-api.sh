#!/usr/bin/env bash
# test-analytics-api.sh — §11 Analytics + §12 App Resources endpoint tests
# Usage: bash scripts/test-analytics-api.sh <email> <password>

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

echo -e "${BOLD}Wake — Analytics & App Resources API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-analytics-api.sh <email> <password>"
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
  else
    if [ "$actual_code" = "$expected_status" ]; then
      pass "$label (got $actual_code)"
    else
      fail "$label — expected $expected_status, got: ${response:0:200}"
    fi
  fi
}

# ── 1. GET /analytics/weekly-volume ──────────────────────────────────────────
section "GET /api/v1/analytics/weekly-volume"

START_DATE="2026-03-02"
END_DATE="2026-03-15"

R=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/analytics/weekly-volume?startDate=${START_DATE}&endDate=${END_DATE}")
check "GET weekly-volume returns array" "ok" "$R"
DATA_LEN=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "?")
echo "       weeks returned: $DATA_LEN"

# Verify shape if data present
echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
if d:
    w = d[0]
    assert 'weekKey' in w, 'missing weekKey'
    assert 'weekStartDate' in w, 'missing weekStartDate'
    assert 'weekEndDate' in w, 'missing weekEndDate'
    assert 'totalSessions' in w, 'missing totalSessions'
    assert 'muscleVolumes' in w, 'missing muscleVolumes'
    assert 'totalSets' in w, 'missing totalSets'
    mv = w['muscleVolumes']
    for g in ['push','pull','legs','shoulders','core']:
        assert g in mv, f'missing muscle group: {g}'
    print('shape ok')
else:
    print('no data (empty history)')
" 2>/dev/null && pass "GET weekly-volume response shape valid" || fail "GET weekly-volume bad shape"

# Missing startDate
R=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/analytics/weekly-volume?endDate=${END_DATE}")
check "GET weekly-volume missing startDate returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Range > 12 weeks
R=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/analytics/weekly-volume?startDate=2026-01-01&endDate=2026-06-01")
check "GET weekly-volume range > 12 weeks returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth
R=$(curl -s "$BASE/analytics/weekly-volume?startDate=${START_DATE}&endDate=${END_DATE}")
check "GET weekly-volume no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 2. GET /analytics/muscle-breakdown ───────────────────────────────────────
section "GET /api/v1/analytics/muscle-breakdown"

R=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/analytics/muscle-breakdown?startDate=${START_DATE}&endDate=${END_DATE}")
check "GET muscle-breakdown returns data" "ok" "$R"

echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
assert 'period' in d, 'missing period'
assert 'muscles' in d, 'missing muscles'
assert 'totalSessions' in d, 'missing totalSessions'
assert 'totalSets' in d, 'missing totalSets'
mv = d['muscles']
for g in ['push','pull','legs','shoulders','core']:
    assert g in mv, f'missing muscle group: {g}'
print('shape ok, totalSessions=%d, totalSets=%d' % (d['totalSessions'], d['totalSets']))
" 2>/dev/null && pass "GET muscle-breakdown response shape valid" || fail "GET muscle-breakdown bad shape"

TOTAL_SESSIONS=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['totalSessions'])" 2>/dev/null || echo "?")
TOTAL_SETS=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['totalSets'])" 2>/dev/null || echo "?")
echo "       totalSessions: $TOTAL_SESSIONS, totalSets: $TOTAL_SETS"

# Missing params
R=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/analytics/muscle-breakdown?startDate=${START_DATE}")
check "GET muscle-breakdown missing endDate returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Range > 90 days
R=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/analytics/muscle-breakdown?startDate=2026-01-01&endDate=2026-06-01")
check "GET muscle-breakdown range > 90 days returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth
R=$(curl -s "$BASE/analytics/muscle-breakdown?startDate=${START_DATE}&endDate=${END_DATE}")
check "GET muscle-breakdown no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 3. GET /app-resources ─────────────────────────────────────────────────────
section "GET /api/v1/app-resources (public, no auth)"

R=$(curl -s "$BASE/app-resources")
check "GET app-resources returns data (no auth)" "ok" "$R"

echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
assert 'hero' in d, 'missing hero'
assert 'programCards' in d, 'missing programCards'
hero = d['hero']
assert 'imageUrl' in hero, 'hero missing imageUrl'
assert 'headline' in hero, 'hero missing headline'
assert 'subheadline' in hero, 'hero missing subheadline'
assert isinstance(d['programCards'], list), 'programCards must be array'
print('shape ok, programCards=%d' % len(d['programCards']))
" 2>/dev/null && pass "GET app-resources response shape valid" || fail "GET app-resources bad shape"

# Verify Cache-Control header is set
CACHE_HEADER=$(curl -s -I "$BASE/app-resources" | python3 -c "
import sys
for line in sys.stdin:
    if line.lower().startswith('cache-control'):
        print(line.strip())
        break
else:
    print('')
" 2>/dev/null)
if echo "$CACHE_HEADER" | grep -qi "public"; then
  pass "GET app-resources has Cache-Control: public header"
else
  fail "GET app-resources missing Cache-Control: public — got: '$CACHE_HEADER'"
fi

CARDS=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['programCards']))" 2>/dev/null || echo "?")
echo "       programCards: $CARDS"

# With auth also works
R=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/app-resources")
check "GET app-resources works with auth too" "ok" "$R"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────${RESET}"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed${RESET}"
  exit 1
fi
