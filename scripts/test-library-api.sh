#!/usr/bin/env bash
# test-library-api.sh — Domain 7.4 Library remaining endpoints + 7.5 schedule/activity
# Usage: bash scripts/test-library-api.sh <email> <password>

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

echo -e "${BOLD}Wake — Library + Schedule + Activity API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-library-api.sh <email> <password>"
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

# ══════════════════════════════════════════════════════════════════════════════
# §7.4 Library Sessions — Exercise & Set CRUD
# ══════════════════════════════════════════════════════════════════════════════

section "Setup — create a library session to work with"

R=$(curl -s -X POST "$BASE/creator/library/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Sesión de Prueba — Biblioteca"}')
check "POST library session created" "ok" "$R"

SESSION_ID=$(extract "$R" "sessionId")
if [ -z "$SESSION_ID" ]; then
  fail "Could not extract sessionId — cannot continue library exercise tests"
  exit 1
fi
pass "Library sessionId: $SESSION_ID"

# ── Library Session Exercises ─────────────────────────────────────────────────

section "POST /creator/library/sessions/:sessionId/exercises — add exercise"

R=$(curl -s -X POST "$BASE/creator/library/sessions/$SESSION_ID/exercises" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sentadilla","order":0,"primaryMuscles":["quads","glutes"]}')
check "POST library exercise returns exerciseId" "ok" "$R"

EX_ID=$(extract "$R" "exerciseId")
if [ -z "$EX_ID" ]; then
  fail "Could not extract exerciseId"
  exit 1
fi
pass "exerciseId extracted: $EX_ID"

# Missing required field
R=$(curl -s -X POST "$BASE/creator/library/sessions/$SESSION_ID/exercises" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sin order"}')
check "POST exercise missing order returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Nonexistent session
R=$(curl -s -X POST "$BASE/creator/library/sessions/nonexistent-session-xyz/exercises" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","order":0}')
check "POST exercise on nonexistent session returns NOT_FOUND" "NOT_FOUND" "$R"

section "GET library session — verify exercise appears"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/sessions/$SESSION_ID")
check "GET library session returns data" "ok" "$R"

EX_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data'].get('exercises',[])))" 2>/dev/null || echo "0")
if [ "$EX_COUNT" -ge 1 ]; then
  pass "Library session has $EX_COUNT exercise(s)"
else
  fail "Expected ≥1 exercise in library session, got $EX_COUNT"
fi

section "PATCH /creator/library/sessions/:sessionId/exercises/:exerciseId — update exercise"

R=$(curl -s -X PATCH "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sentadilla Profunda","primaryMuscles":["quads","glutes","hamstrings"]}')
check "PATCH library exercise name/muscles" "ok" "$R"

# Nonexistent exercise
R=$(curl -s -X PATCH "$BASE/creator/library/sessions/$SESSION_ID/exercises/nonexistent-ex-xyz" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"X"}')
check "PATCH nonexistent library exercise returns NOT_FOUND" "NOT_FOUND" "$R"

# ── Library Session Sets ───────────────────────────────────────────────────────

section "POST /creator/library/sessions/:sessionId/exercises/:exerciseId/sets — add set"

R=$(curl -s -X POST "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID/sets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"8-10","order":0,"weight":80,"rir":2}')
check "POST library set returns setId" "ok" "$R"

SET_ID=$(extract "$R" "setId")
if [ -z "$SET_ID" ]; then
  fail "Could not extract setId"
  exit 1
fi
pass "setId extracted: $SET_ID"

# Missing order
R=$(curl -s -X POST "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID/sets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"6"}')
check "POST library set missing order returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Add a second set
R=$(curl -s -X POST "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID/sets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"6-8","order":1,"intensity":"RPE 8"}')
check "POST second library set with intensity" "ok" "$R"

section "GET library session — verify sets present"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/sessions/$SESSION_ID")
check "GET library session shows sets under exercise" "ok" "$R"

SETS_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); exs=d['data'].get('exercises',[]); print(len(exs[0]['sets']) if exs else 0)" 2>/dev/null || echo "0")
if [ "$SETS_COUNT" -eq 2 ]; then
  pass "Library exercise has 2 sets"
else
  fail "Expected 2 sets in library exercise, got $SETS_COUNT"
fi

section "PATCH /creator/library/sessions/:sessionId/exercises/:exerciseId/sets/:setId — update set"

R=$(curl -s -X PATCH "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID/sets/$SET_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"10-12","weight":75,"rir":3}')
check "PATCH library set reps/weight/rir" "ok" "$R"

# Nonexistent set
R=$(curl -s -X PATCH "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID/sets/nonexistent-set-xyz" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reps":"5"}')
check "PATCH nonexistent library set returns NOT_FOUND" "NOT_FOUND" "$R"

section "DELETE /creator/library/sessions/:sessionId/exercises/:exerciseId/sets/:setId — delete set"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID/sets/$SET_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE library set returns 204"
else
  fail "DELETE library set expected 204, got $HTTP_CODE: $(echo "$R" | head -1)"
fi

# Already deleted
R=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID/sets/$SET_ID")
check "DELETE already-deleted library set returns NOT_FOUND" "NOT_FOUND" "$R"

section "DELETE /creator/library/sessions/:sessionId/exercises/:exerciseId — delete exercise (cascade sets)"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "DELETE library exercise returns 204"
else
  fail "DELETE library exercise expected 204, got $HTTP_CODE"
fi

# Verify cascade: session should have 0 exercises
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/library/sessions/$SESSION_ID")
EX_COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data'].get('exercises',[])))" 2>/dev/null || echo "-1")
if [ "$EX_COUNT" = "0" ]; then
  pass "Library session exercises=0 after exercise delete"
else
  fail "Expected 0 exercises after delete, got $EX_COUNT"
fi

# Already deleted exercise
R=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/library/sessions/$SESSION_ID/exercises/$EX_ID")
check "DELETE already-deleted library exercise returns NOT_FOUND" "NOT_FOUND" "$R"

# ══════════════════════════════════════════════════════════════════════════════
# §7.4 Propagate — Library Sessions
# ══════════════════════════════════════════════════════════════════════════════

section "POST /creator/library/sessions/:sessionId/propagate"

R=$(curl -s -X POST "$BASE/creator/library/sessions/$SESSION_ID/propagate" \
  -H "Authorization: Bearer $TOKEN")
check "POST propagate library session returns plansAffected + copiesDeleted" "ok" "$R"

PLANS_AFFECTED=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('plansAffected','missing'))" 2>/dev/null)
COPIES_DELETED=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('copiesDeleted','missing'))" 2>/dev/null)
echo "       plansAffected: $PLANS_AFFECTED, copiesDeleted: $COPIES_DELETED"

# Nonexistent session
R=$(curl -s -X POST "$BASE/creator/library/sessions/nonexistent-session-xyz/propagate" \
  -H "Authorization: Bearer $TOKEN")
check "POST propagate nonexistent session returns NOT_FOUND" "NOT_FOUND" "$R"

# ══════════════════════════════════════════════════════════════════════════════
# §7.4 Propagate — Library Modules
# ══════════════════════════════════════════════════════════════════════════════

section "POST /creator/library/modules/:moduleId/propagate"

# First create a module
R=$(curl -s -X POST "$BASE/creator/library/modules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Módulo de Prueba"}')
check "POST library module for propagate test" "ok" "$R"
MODULE_ID=$(extract "$R" "moduleId")

if [ -n "$MODULE_ID" ]; then
  R=$(curl -s -X POST "$BASE/creator/library/modules/$MODULE_ID/propagate" \
    -H "Authorization: Bearer $TOKEN")
  check "POST propagate library module returns data" "ok" "$R"

  PLANS_AFFECTED=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('plansAffected','missing'))" 2>/dev/null)
  echo "       plansAffected: $PLANS_AFFECTED"

  # Clean up
  curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/library/modules/$MODULE_ID"
fi

# Nonexistent module
R=$(curl -s -X POST "$BASE/creator/library/modules/nonexistent-module-xyz/propagate" \
  -H "Authorization: Bearer $TOKEN")
check "POST propagate nonexistent module returns NOT_FOUND" "NOT_FOUND" "$R"

# ══════════════════════════════════════════════════════════════════════════════
# §7.5 Client Programs — Schedule
# ══════════════════════════════════════════════════════════════════════════════

section "Schedule endpoints — check with existing clients"

# Get first client
R_CLIENTS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients")
FIRST_CLIENT=$(echo "$R_CLIENTS" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['clientId'] if d else '')" 2>/dev/null)

if [ -n "$FIRST_CLIENT" ]; then
  echo "       using clientId: ${FIRST_CLIENT:0:20}..."

  # Get first assigned program for that client
  R_PROGRAMS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT/programs")
  FIRST_PROGRAM=$(echo "$R_PROGRAMS" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['courseId'] if d else '')" 2>/dev/null)

  if [ -n "$FIRST_PROGRAM" ]; then
    echo "       using programId: ${FIRST_PROGRAM:0:20}..."

    section "PUT /creator/clients/:clientId/programs/:programId/schedule/:weekKey"

    # Get a plan to use for scheduling
    R_PLANS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans")
    FIRST_PLAN=$(echo "$R_PLANS" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['planId'] if d else '')" 2>/dev/null)

    if [ -n "$FIRST_PLAN" ]; then
      # Get a module from that plan
      R_PLAN=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/plans/$FIRST_PLAN")
      FIRST_MODULE=$(echo "$R_PLAN" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']['modules']; print(d[0]['moduleId'] if d else '')" 2>/dev/null)

      if [ -n "$FIRST_MODULE" ]; then
        WEEK_KEY="2026-W12"
        R=$(curl -s -X PUT "$BASE/creator/clients/$FIRST_CLIENT/programs/$FIRST_PROGRAM/schedule/$WEEK_KEY" \
          -H "Authorization: Bearer $TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"planId\":\"$FIRST_PLAN\",\"moduleId\":\"$FIRST_MODULE\",\"moduleIndex\":0}")
        check "PUT schedule/:weekKey assigns plan+module" "ok" "$R"

        WEEK_RETURNED=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('weekKey',''))" 2>/dev/null)
        if [ "$WEEK_RETURNED" = "$WEEK_KEY" ]; then
          pass "PUT schedule — weekKey matches"
        else
          fail "PUT schedule — expected weekKey=$WEEK_KEY, got $WEEK_RETURNED"
        fi

        section "DELETE /creator/clients/:clientId/programs/:programId/schedule/:weekKey"

        R=$(curl -s -X DELETE -w "\n%{http_code}" \
          -H "Authorization: Bearer $TOKEN" \
          "$BASE/creator/clients/$FIRST_CLIENT/programs/$FIRST_PROGRAM/schedule/$WEEK_KEY")
        HTTP_CODE=$(echo "$R" | tail -1)
        if [ "$HTTP_CODE" = "204" ]; then
          pass "DELETE schedule/:weekKey returns 204"
        else
          fail "DELETE schedule/:weekKey expected 204, got $HTTP_CODE"
        fi

        # Idempotent — deleting again should still return 204
        R=$(curl -s -X DELETE -w "\n%{http_code}" \
          -H "Authorization: Bearer $TOKEN" \
          "$BASE/creator/clients/$FIRST_CLIENT/programs/$FIRST_PROGRAM/schedule/$WEEK_KEY")
        HTTP_CODE=$(echo "$R" | tail -1)
        if [ "$HTTP_CODE" = "204" ]; then
          pass "DELETE schedule/:weekKey idempotent (204 again)"
        else
          fail "DELETE schedule/:weekKey idempotent — expected 204, got $HTTP_CODE"
        fi
      else
        echo "       (no modules in plan — skipping PUT/DELETE schedule tests)"
      fi
    else
      echo "       (no plans found — skipping PUT/DELETE schedule tests)"
    fi

    # Validation: missing planId
    R=$(curl -s -X PUT "$BASE/creator/clients/$FIRST_CLIENT/programs/$FIRST_PROGRAM/schedule/2026-W99" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"moduleId":"some-module"}')
    check "PUT schedule missing planId returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

  else
    echo "       (client has no programs — skipping program schedule tests)"
  fi

  # ── §7.5 Client Sessions ───────────────────────────────────────────────────

  section "GET /creator/clients/:clientId/sessions"

  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT/sessions")
  check "GET client sessions returns array" "ok" "$R"

  SESSION_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")
  HAS_MORE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hasMore', False))" 2>/dev/null)
  echo "       sessions: $SESSION_COUNT, hasMore: $HAS_MORE"

  # ── §7.5 Client Activity ───────────────────────────────────────────────────

  section "GET /creator/clients/:clientId/activity"

  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT/activity")
  check "GET client activity returns data" "ok" "$R"

  CLIENT_ID_FIELD=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('clientId',''))" 2>/dev/null)
  if [ "$CLIENT_ID_FIELD" = "$FIRST_CLIENT" ]; then
    pass "GET client activity — clientId matches"
  else
    fail "GET client activity — clientId mismatch: $CLIENT_ID_FIELD"
  fi

  echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print('       totalSessionsAllTime:', d.get('totalSessionsAllTime'))
print('       currentStreak:', d.get('currentStreak'))
print('       lastActivityDate:', d.get('lastActivityDate'))
print('       assignedCourses count:', len(d.get('assignedCourses', [])))
" 2>/dev/null || true

else
  echo "       (no clients found — skipping client-specific tests)"
fi

# ── Auth enforcement ──────────────────────────────────────────────────────────

section "Auth enforcement"

R=$(curl -s "$BASE/creator/library/sessions/any/exercises")
# POST without auth — won't have auth header so will get UNAUTHENTICATED
R=$(curl -s -X POST "$BASE/creator/library/sessions/any/exercises" \
  -H "Content-Type: application/json" \
  -d '{"name":"x","order":0}')
check "POST library exercise no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

R=$(curl -s -X POST "$BASE/creator/library/sessions/any/propagate")
check "POST propagate no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

R=$(curl -s -X PUT "$BASE/creator/clients/any/programs/any/schedule/2026-W01" \
  -H "Content-Type: application/json" \
  -d '{"planId":"x","moduleId":"y"}')
check "PUT schedule no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

R=$(curl -s "$BASE/creator/clients/any/activity")
check "GET client activity no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── Cleanup — delete the library session created at the start ─────────────────

section "Cleanup"

R=$(curl -s -X DELETE -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/library/sessions/$SESSION_ID")
HTTP_CODE=$(echo "$R" | tail -1)
if [ "$HTTP_CODE" = "204" ]; then
  pass "Cleanup: deleted library session $SESSION_ID"
else
  fail "Cleanup: DELETE returned $HTTP_CODE"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed!${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed.${RESET}"
  exit 1
fi
