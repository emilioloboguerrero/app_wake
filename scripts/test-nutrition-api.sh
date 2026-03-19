#!/usr/bin/env bash
# test-nutrition-api.sh — Domain 3 Nutrition endpoint tests
# Usage: bash scripts/test-nutrition-api.sh <email> <password>

set -euo pipefail

BASE="${BASE:-http://localhost:5001/wolf-20b8b/us-central1/api/api/v1}"
API_KEY="AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g"
TODAY=$(date +%Y-%m-%d)

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${RESET}  $1"; }
fail() { echo -e "${RED}✗ FAIL${RESET}  $1"; }
section() { echo -e "\n${BOLD}${YELLOW}── $1 ──${RESET}"; }

echo -e "${BOLD}Wake — Nutrition API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-nutrition-api.sh <email> <password>"
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

# ── Helper ────────────────────────────────────────────────────────────────────
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

# ── 1. Diary CRUD ─────────────────────────────────────────────────────────────
section "POST /api/v1/nutrition/diary — log entry"

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"${TODAY}\",\"meal\":\"breakfast\",\"foodId\":\"12345\",\"servingId\":\"67890\",\"numberOfUnits\":1.5,\"name\":\"Avena\",\"calories\":250,\"protein\":8,\"carbs\":45,\"fat\":4}" \
  "$BASE/nutrition/diary")
check "POST diary logs entry" "ok" "$R"

ENTRY_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['entryId'])" 2>/dev/null)
echo "       entryId: $ENTRY_ID"

# Validation: invalid date
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"not-a-date","meal":"lunch","foodId":"1","servingId":"2","numberOfUnits":1,"name":"Test"}' \
  "$BASE/nutrition/diary")
check "Invalid date returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Validation: invalid meal
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"${TODAY}\",\"meal\":\"elevenses\",\"foodId\":\"1\",\"servingId\":\"2\",\"numberOfUnits\":1,\"name\":\"Test\"}" \
  "$BASE/nutrition/diary")
check "Invalid meal returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth
R=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"date":"2024-01-01","meal":"lunch","foodId":"1","servingId":"2","numberOfUnits":1,"name":"Test"}' \
  "$BASE/nutrition/diary")
check "No auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "GET /api/v1/nutrition/diary?date=today"
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/nutrition/diary?date=${TODAY}")
check "GET diary by date returns array" "ok" "$R"
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       entries today: $COUNT"

# Range query
section "GET /api/v1/nutrition/diary?startDate=&endDate="
PAST=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d 2>/dev/null || echo "2025-01-01")
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/nutrition/diary?startDate=${PAST}&endDate=${TODAY}")
check "GET diary range returns array" "ok" "$R"

# Range > 90 days
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/nutrition/diary?startDate=2020-01-01&endDate=2025-01-01")
check "Range > 90 days returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Missing params
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/nutrition/diary")
check "Missing date params returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

section "PATCH /api/v1/nutrition/diary/:entryId"
if [ -n "$ENTRY_ID" ]; then
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"numberOfUnits":2,"calories":500}' \
    "$BASE/nutrition/diary/${ENTRY_ID}")
  check "PATCH diary updates entry" "ok" "$R"

  # Not found
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"numberOfUnits":1}' \
    "$BASE/nutrition/diary/nonexistent-id-xyz")
  check "PATCH nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"
else
  fail "Skipping PATCH test — no entryId from POST"
fi

section "DELETE /api/v1/nutrition/diary/:entryId"
if [ -n "$ENTRY_ID" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/nutrition/diary/${ENTRY_ID}")
  if [ "$R" = "204" ]; then
    pass "DELETE diary removes entry (204)"
  else
    fail "DELETE diary returned HTTP $R"
  fi

  # Already deleted → 404
  R=$(curl -s -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/nutrition/diary/${ENTRY_ID}")
  check "DELETE nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"
else
  fail "Skipping DELETE test — no entryId from POST"
fi

# ── 2. Saved Foods ────────────────────────────────────────────────────────────
section "GET /api/v1/nutrition/saved-foods"
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/nutrition/saved-foods")
check "GET saved-foods returns array" "ok" "$R"

section "POST /api/v1/nutrition/saved-foods"
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"foodId":"test-food-999","name":"Test Food","calories":100,"protein":5,"carbs":15,"fat":2}' \
  "$BASE/nutrition/saved-foods")
check "POST saved-foods saves food" "ok" "$R"

SAVED_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['savedFoodId'])" 2>/dev/null)
echo "       savedFoodId: $SAVED_ID"

# Duplicate
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"foodId":"test-food-999","name":"Test Food"}' \
  "$BASE/nutrition/saved-foods")
check "Duplicate saved food returns CONFLICT" "CONFLICT" "$R"

section "DELETE /api/v1/nutrition/saved-foods/:savedFoodId"
if [ -n "$SAVED_ID" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/nutrition/saved-foods/${SAVED_ID}")
  if [ "$R" = "204" ]; then
    pass "DELETE saved-food removes entry (204)"
  else
    fail "DELETE saved-food returned HTTP $R"
  fi
else
  fail "Skipping DELETE saved-food test — no savedFoodId"
fi

# ── 3. Creator Meal Library ────────────────────────────────────────────────────
section "GET /api/v1/creator/nutrition/meals"
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/nutrition/meals")
if echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null; then
  pass "GET creator meals returns data (creator) or FORBIDDEN (non-creator)"
  MEAL_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])) if 'data' in d else 'n/a')" 2>/dev/null)
  echo "       meals: $MEAL_COUNT"
else
  ERROR_CODE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('code','?'))" 2>/dev/null)
  if [ "$ERROR_CODE" = "FORBIDDEN" ]; then
    pass "GET creator meals returns FORBIDDEN for non-creator"
  else
    fail "GET creator meals — unexpected: ${R:0:200}"
  fi
fi

section "POST /api/v1/creator/nutrition/meals"
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Meal API","items":[]}' \
  "$BASE/creator/nutrition/meals")
MEAL_ID=""
if echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d and 'mealId' in d['data']" 2>/dev/null; then
  pass "POST creator meals creates meal"
  MEAL_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['mealId'])" 2>/dev/null)
  echo "       mealId: $MEAL_ID"
elif echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('error',{}).get('code') == 'FORBIDDEN'" 2>/dev/null; then
  pass "POST creator meals returns FORBIDDEN for non-creator (expected)"
else
  fail "POST creator meals — unexpected: ${R:0:200}"
fi

if [ -n "$MEAL_ID" ]; then
  section "PATCH /api/v1/creator/nutrition/meals/:mealId"
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test Meal API Updated"}' \
    "$BASE/creator/nutrition/meals/${MEAL_ID}")
  check "PATCH creator meal updates name" "ok" "$R"

  section "DELETE /api/v1/creator/nutrition/meals/:mealId"
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/nutrition/meals/${MEAL_ID}")
  if [ "$R" = "204" ]; then
    pass "DELETE creator meal removes it (204)"
  else
    fail "DELETE creator meal returned HTTP $R"
  fi
fi

# ── 4. Creator Plan Library ────────────────────────────────────────────────────
section "POST /api/v1/creator/nutrition/plans"
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Plan API","description":"","categories":[],"dailyCalories":2000,"dailyProteinG":150}' \
  "$BASE/creator/nutrition/plans")
PLAN_ID=""
if echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d and 'planId' in d['data']" 2>/dev/null; then
  pass "POST creator plans creates plan"
  PLAN_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['planId'])" 2>/dev/null)
  echo "       planId: $PLAN_ID"
elif echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('error',{}).get('code') == 'FORBIDDEN'" 2>/dev/null; then
  pass "POST creator plans returns FORBIDDEN for non-creator (expected)"
else
  fail "POST creator plans — unexpected: ${R:0:200}"
fi

if [ -n "$PLAN_ID" ]; then
  section "GET /api/v1/creator/nutrition/plans"
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/nutrition/plans")
  check "GET creator plans returns array" "ok" "$R"

  section "GET /api/v1/creator/nutrition/plans/:planId"
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/nutrition/plans/${PLAN_ID}")
  check "GET creator plan detail returns data" "ok" "$R"
  DAILY_CAL=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('dailyCalories'))" 2>/dev/null)
  echo "       dailyCalories: $DAILY_CAL"

  section "PATCH /api/v1/creator/nutrition/plans/:planId"
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"dailyCalories":2200}' \
    "$BASE/creator/nutrition/plans/${PLAN_ID}")
  check "PATCH creator plan updates fields" "ok" "$R"

  section "POST /api/v1/creator/nutrition/plans/:planId/propagate"
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/nutrition/plans/${PLAN_ID}/propagate")
  check "Propagate returns clientsAffected" "ok" "$R"
  CLIENTS=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['clientsAffected'])" 2>/dev/null)
  echo "       clientsAffected: $CLIENTS"

  section "DELETE /api/v1/creator/nutrition/plans/:planId"
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/nutrition/plans/${PLAN_ID}")
  if [ "$R" = "204" ]; then
    pass "DELETE creator plan removes it (204)"
  else
    fail "DELETE creator plan returned HTTP $R"
  fi

  # Already deleted → 404
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/nutrition/plans/${PLAN_ID}")
  check "GET deleted plan returns NOT_FOUND" "NOT_FOUND" "$R"
fi

# ── 5. Nutrition Assignment ────────────────────────────────────────────────────
section "GET /api/v1/nutrition/assignment"
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/nutrition/assignment?date=${TODAY}")
if echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null; then
  pass "GET assignment returns active plan"
  ASSIGN_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['assignmentId'])" 2>/dev/null)
  echo "       assignmentId: $ASSIGN_ID"
elif echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('error',{}).get('code') == 'NOT_FOUND'" 2>/dev/null; then
  pass "GET assignment returns NOT_FOUND (no assignment — expected for test user)"
else
  fail "GET assignment — unexpected: ${R:0:200}"
fi

# Invalid date
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/nutrition/assignment?date=bad")
check "Invalid assignment date returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth
R=$(curl -s "$BASE/nutrition/assignment?date=${TODAY}")
check "No auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

echo -e "\n${BOLD}Done.${RESET}"
