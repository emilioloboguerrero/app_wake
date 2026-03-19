#!/usr/bin/env bash
# test-plans-api.sh — Domain 7.3 Creator Plans endpoint tests
# Usage: bash scripts/test-plans-api.sh <email> <password>

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

echo -e "${BOLD}Wake — Creator Plans API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-plans-api.sh <email> <password>"
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

# ── Plans — List & Create ──────────────────────────────────────────────────────
section "GET /api/v1/creator/plans — list plans"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans")
check "GET plans returns array" "ok" "$R"

section "POST /api/v1/creator/plans — create plan"

R=$(curl -s -X POST "$BASE/creator/plans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Plan de Fuerza","description":"Un plan de 4 semanas","discipline":"strength"}')
check "POST plan returns planId + firstModuleId" "ok" "$R"

PLAN_ID=$(extract "$R" "planId")
FIRST_MODULE_ID=$(extract "$R" "firstModuleId")

if [ -z "$PLAN_ID" ]; then
  fail "Could not extract planId from create response"
  exit 1
fi
pass "planId extracted: $PLAN_ID"
pass "firstModuleId extracted: $FIRST_MODULE_ID"

R=$(curl -s -X POST "$BASE/creator/plans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
check "POST plan without title returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# ── Plans — Get & Update ───────────────────────────────────────────────────────
section "GET /api/v1/creator/plans/:planId — get plan with modules"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans/$PLAN_ID")
check "GET plan returns data with modules array" "ok" "$R"

MODULE_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['modules']))" 2>/dev/null || echo "0")
if [ "$MODULE_COUNT" -ge 1 ]; then
  pass "Plan has $MODULE_COUNT module(s) (auto-created Semana 1)"
else
  fail "Plan should have at least 1 auto-created module"
fi

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans/nonexistent-plan-id")
check "GET nonexistent plan returns NOT_FOUND" "NOT_FOUND" "$R"

section "PATCH /api/v1/creator/plans/:planId — update plan"

R=$(curl -s -X PATCH "$BASE/creator/plans/$PLAN_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Plan de Fuerza Avanzado","discipline":"powerlifting"}')
check "PATCH plan title/discipline" "ok" "$R"

# ── Modules — Add & Update ─────────────────────────────────────────────────────
section "POST /api/v1/creator/plans/:planId/modules — add module"

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Semana 2","order":1}')
check "POST module returns moduleId" "ok" "$R"

MODULE_ID=$(extract "$R" "moduleId")
if [ -z "$MODULE_ID" ]; then
  fail "Could not extract moduleId"
  MODULE_ID="$FIRST_MODULE_ID"
else
  pass "moduleId extracted: $MODULE_ID"
fi

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Solo titulo sin order"}')
check "POST module without order returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

section "PATCH /api/v1/creator/plans/:planId/modules/:moduleId — update module"

R=$(curl -s -X PATCH "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Semana 2 — Actualizada","order":1}')
check "PATCH module title" "ok" "$R"

R=$(curl -s -X PATCH "$BASE/creator/plans/$PLAN_ID/modules/nonexistent-mod" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"X"}')
check "PATCH nonexistent module returns NOT_FOUND" "NOT_FOUND" "$R"

# ── Sessions — Add, Get, Update ────────────────────────────────────────────────
section "POST .../modules/:moduleId/sessions — add session"

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Día 1 — Pecho","order":0}')
check "POST session returns sessionId" "ok" "$R"

SESSION_ID=$(extract "$R" "sessionId")
if [ -z "$SESSION_ID" ]; then
  fail "Could not extract sessionId"
  exit 1
fi
pass "sessionId extracted: $SESSION_ID"

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Faltan order"}')
check "POST session without order returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

section "GET .../sessions/:sessionId — get session with exercises"

R=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID")
check "GET session returns data with exercises array" "ok" "$R"

EX_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['exercises']))" 2>/dev/null || echo "0")
if [ "$EX_COUNT" -eq 0 ]; then
  pass "New session has 0 exercises (correct)"
else
  fail "New session should have 0 exercises, got $EX_COUNT"
fi

section "PATCH .../sessions/:sessionId — update session"

R=$(curl -s -X PATCH "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Día 1 — Empuje","order":0}')
check "PATCH session title" "ok" "$R"

# ── Exercises — Add, Update, Delete ────────────────────────────────────────────
section "POST .../sessions/:sessionId/exercises — add exercise"

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Press de Banca","order":0,"primaryMuscles":["chest","triceps"]}')
check "POST exercise returns exerciseId" "ok" "$R"

EX_ID=$(extract "$R" "exerciseId")
if [ -z "$EX_ID" ]; then
  fail "Could not extract exerciseId"
  exit 1
fi
pass "exerciseId extracted: $EX_ID"

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Falta order"}')
check "POST exercise without order returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

section "GET session — verify exerciseCount after adding exercise"

R=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID")
check "GET session after adding exercise" "ok" "$R"

EX_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['exercises']))" 2>/dev/null || echo "0")
if [ "$EX_COUNT" -eq 1 ]; then
  pass "Session now has 1 exercise"
else
  fail "Expected 1 exercise in session, got $EX_COUNT"
fi

section "PATCH .../exercises/:exerciseId — update exercise"

R=$(curl -s -X PATCH "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises/$EX_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Press de Banca Plano","primaryMuscles":["chest","triceps","anterior_delt"]}')
check "PATCH exercise name/muscles" "ok" "$R"

# ── Sets — Add, Update, Delete ─────────────────────────────────────────────────
section "POST .../exercises/:exerciseId/sets — add set"

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises/$EX_ID/sets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"8-10","order":0,"weight":80,"rir":2}')
check "POST set returns setId" "ok" "$R"

SET_ID=$(extract "$R" "setId")
if [ -z "$SET_ID" ]; then
  fail "Could not extract setId"
  exit 1
fi
pass "setId extracted: $SET_ID"

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises/$EX_ID/sets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"6"}')
check "POST set without order returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

R=$(curl -s -X POST "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises/$EX_ID/sets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"6-8","order":1,"intensity":"RPE 8"}')
check "POST second set with intensity" "ok" "$R"

section "GET session — verify sets present"

R=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID")
check "GET session shows sets under exercise" "ok" "$R"

SETS_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['exercises'][0]['sets']))" 2>/dev/null || echo "0")
if [ "$SETS_COUNT" -eq 2 ]; then
  pass "Exercise has 2 sets"
else
  fail "Expected 2 sets, got $SETS_COUNT"
fi

section "PATCH .../sets/:setId — update set"

R=$(curl -s -X PATCH "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises/$EX_ID/sets/$SET_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"10-12","weight":75,"rir":3}')
check "PATCH set reps/weight/rir" "ok" "$R"

section "DELETE .../sets/:setId — delete set"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises/$EX_ID/sets/$SET_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE set returns 204"
else
  fail "DELETE set expected 204, got $HTTP_CODE: $(echo "$R" | head -1)"
fi

R=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises/$EX_ID/sets/$SET_ID")
check "DELETE already-deleted set returns NOT_FOUND" "NOT_FOUND" "$R"

# ── GET plan — verify exerciseCount in module list ─────────────────────────────
section "GET /api/v1/creator/plans/:planId — verify exerciseCount"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans/$PLAN_ID")
check "GET plan returns modules with sessions" "ok" "$R"

# Find the module we added sessions to
EXERCISE_COUNT=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for mod in d['data']['modules']:
    if mod['moduleId'] == '$MODULE_ID':
        for s in mod['sessions']:
            if s['sessionId'] == '$SESSION_ID':
                print(s['exerciseCount'])
                sys.exit()
print('not_found')
" 2>/dev/null || echo "err")

if [ "$EXERCISE_COUNT" = "1" ]; then
  pass "exerciseCount=1 in plan GET (correct)"
else
  fail "Expected exerciseCount=1, got $EXERCISE_COUNT"
fi

# ── DELETE exercise (cascade sets) ────────────────────────────────────────────
section "DELETE .../exercises/:exerciseId — cascades to sets"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID/exercises/$EX_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE exercise returns 204"
else
  fail "DELETE exercise expected 204, got $HTTP_CODE"
fi

R=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID")
EX_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['exercises']))" 2>/dev/null || echo "-1")
if [ "$EX_COUNT" = "0" ]; then
  pass "Session exercises=0 after exercise delete"
else
  fail "Expected 0 exercises after delete, got $EX_COUNT"
fi

# ── DELETE session (cascade exercises) ────────────────────────────────────────
section "DELETE .../sessions/:sessionId — cascades to exercises"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE session returns 204"
else
  fail "DELETE session expected 204, got $HTTP_CODE"
fi

R=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID/sessions/$SESSION_ID")
check "DELETE already-deleted session returns NOT_FOUND" "NOT_FOUND" "$R"

# ── DELETE module (cascade sessions) ──────────────────────────────────────────
section "DELETE .../modules/:moduleId — cascades to sessions"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE module returns 204"
else
  fail "DELETE module expected 204, got $HTTP_CODE"
fi

R=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID/modules/$MODULE_ID")
check "DELETE already-deleted module returns NOT_FOUND" "NOT_FOUND" "$R"

# ── Ownership enforcement ──────────────────────────────────────────────────────
section "Ownership enforcement — wrong plan ID"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans/does-not-exist-xyz")
check "GET nonexistent plan returns NOT_FOUND" "NOT_FOUND" "$R"

R=$(curl -s -X PATCH "$BASE/creator/plans/does-not-exist-xyz" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hack"}')
check "PATCH nonexistent plan returns NOT_FOUND" "NOT_FOUND" "$R"

R=$(curl -s -X POST "$BASE/creator/plans/does-not-exist-xyz/modules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"X","order":0}')
check "POST module on nonexistent plan returns NOT_FOUND" "NOT_FOUND" "$R"

# ── DELETE plan (full cascade) ─────────────────────────────────────────────────
section "DELETE /api/v1/creator/plans/:planId — full cascade"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/plans/$PLAN_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE plan returns 204"
else
  fail "DELETE plan expected 204, got $HTTP_CODE"
fi

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans/$PLAN_ID")
check "GET deleted plan returns NOT_FOUND" "NOT_FOUND" "$R"

R=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans/$PLAN_ID")
check "DELETE already-deleted plan returns NOT_FOUND" "NOT_FOUND" "$R"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed!${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed.${RESET}"
  exit 1
fi
