#!/usr/bin/env bash
# test-workout-api.sh — Domain 5 Workout endpoint tests
# Usage: bash scripts/test-workout-api.sh <email> <password>

set -euo pipefail

BASE="${BASE:-http://localhost:5001/wolf-20b8b/us-central1/api/api/v1}"
API_KEY="AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g"
SESSION_ID="test-session-$(date +%s)"

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

echo -e "${BOLD}Wake — Workout API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-workout-api.sh <email> <password>"
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

# ── 1. Session Completion ─────────────────────────────────────────────────────
section "POST /api/v1/workout/complete — create session"

COMPLETE_BODY=$(cat <<EOF
{
  "sessionId": "${SESSION_ID}",
  "courseId": "test-course-123",
  "courseName": "Programa de Prueba",
  "sessionName": "Sesión de Prueba",
  "completedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "duration": 3600,
  "userNotes": "",
  "exercises": [
    {
      "exerciseId": "ex-001",
      "exerciseName": "Press de Banca",
      "libraryId": "lib-001",
      "sets": [
        {"reps": "8", "weight": "80", "intensity": "RPE 8"},
        {"reps": "8", "weight": "82.5", "intensity": "RPE 9"},
        {"reps": "", "weight": "", "intensity": ""}
      ]
    },
    {
      "exerciseId": "ex-002",
      "exerciseName": "Sentadilla",
      "libraryId": "lib-001",
      "sets": [
        {"reps": "5", "weight": "100"},
        {"reps": "5", "weight": "105"},
        {"reps": "5", "weight": "110"}
      ]
    }
  ]
}
EOF
)

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$COMPLETE_BODY" \
  "$BASE/workout/complete")
check "POST complete creates session" "ok" "$R"
EXERCISES_WRITTEN=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['exercisesWritten'])" 2>/dev/null)
echo "       exercisesWritten: $EXERCISES_WRITTEN"

# Invalid: missing sessionId
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"exercises":[]}' \
  "$BASE/workout/complete")
check "POST complete missing sessionId returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Invalid: exercises not array
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"x","exercises":"bad"}' \
  "$BASE/workout/complete")
check "POST complete exercises not array returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Exercises with invalid libraryId/exerciseName are silently skipped (exercisesWritten=0)
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"skip-test-$(date +%s)\",\"exercises\":[{\"exerciseId\":\"x\",\"exerciseName\":\"Unknown Exercise\",\"libraryId\":\"unknown\",\"sets\":[{\"reps\":\"5\",\"weight\":\"50\"}]}]}" \
  "$BASE/workout/complete")
check "POST complete invalid exercise skipped silently" "ok" "$R"
WRITTEN=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['exercisesWritten'])" 2>/dev/null)
if [ "${WRITTEN:-1}" = "0" ]; then
  pass "POST complete invalid exercise exercisesWritten=0"
else
  fail "POST complete expected exercisesWritten=0, got $WRITTEN"
fi

# No auth
R=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"x","exercises":[]}' \
  "$BASE/workout/complete")
check "POST complete no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 2. Session History ────────────────────────────────────────────────────────
section "GET /api/v1/workout/sessions — list (paginated)"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/sessions")
check "GET sessions returns array" "ok" "$R"
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       sessions returned: $COUNT"

# With limit=1
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/sessions?limit=1")
check "GET sessions limit=1 returns data" "ok" "$R"
NEXT_TOKEN=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nextPageToken') or '')" 2>/dev/null)
echo "       nextPageToken present: $([ -n "$NEXT_TOKEN" ] && echo yes || echo no)"

# Paginate with token
if [ -n "$NEXT_TOKEN" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/sessions?limit=1&pageToken=${NEXT_TOKEN}")
  check "GET sessions with pageToken returns page 2" "ok" "$R"
fi

# Verify shape of returned session
FIRST_SESSION_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/sessions" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['sessionId'] if d else '')" 2>/dev/null)
echo "       first sessionId: ${FIRST_SESSION_ID:0:20}..."

# No auth
R=$(curl -s "$BASE/workout/sessions")
check "GET sessions no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "GET /api/v1/workout/sessions/:sessionId — single session"

if [ -n "$FIRST_SESSION_ID" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/sessions/${FIRST_SESSION_ID}")
  check "GET session by ID returns session" "ok" "$R"
  SESSION_NAME=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('sessionName',''))" 2>/dev/null)
  echo "       sessionName: $SESSION_NAME"
fi

# Not found
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/sessions/nonexistent-session-id-xyz")
check "GET session nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"

section "PATCH /api/v1/workout/sessions/:sessionId/notes — update notes"

if [ -n "$SESSION_ID" ]; then
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"userNotes":"Muy buen entrenamiento, mejoré el press de banca."}' \
    "$BASE/workout/sessions/${SESSION_ID}/notes")
  check "PATCH session notes updates userNotes" "ok" "$R"
  RETURNED_NOTES=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['userNotes'])" 2>/dev/null)
  echo "       userNotes: ${RETURNED_NOTES:0:40}..."

  # Verify the update persisted
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/sessions/${SESSION_ID}")
  STORED_NOTES=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['userNotes'])" 2>/dev/null)
  if [ "$STORED_NOTES" = "Muy buen entrenamiento, mejoré el press de banca." ]; then
    pass "PATCH notes — GET confirms update persisted"
  else
    fail "PATCH notes — GET returned: '$STORED_NOTES'"
  fi

  # Clear notes (empty string)
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"userNotes":""}' \
    "$BASE/workout/sessions/${SESSION_ID}/notes")
  check "PATCH session notes can clear to empty string" "ok" "$R"
fi

# Missing userNotes field
R=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"other":"field"}' \
  "$BASE/workout/sessions/any/notes")
check "PATCH session notes missing userNotes returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Not found
R=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userNotes":"test"}' \
  "$BASE/workout/sessions/nonexistent-xyz/notes")
check "PATCH session notes nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 3. Checkpoint ─────────────────────────────────────────────────────────────
section "PUT /api/v1/workout/checkpoint — save"

CHECKPOINT_BODY='{"sessionId":"test-session","courseId":"course-1","exercises":[{"name":"Press","sets":[{"reps":8,"weight":80}]}],"startedAt":"2026-03-17T10:00:00.000Z"}'

R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CHECKPOINT_BODY" \
  "$BASE/workout/checkpoint")
check "PUT checkpoint saves state" "ok" "$R"
SAVED_AT=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('savedAt',''))" 2>/dev/null)
echo "       savedAt: ${SAVED_AT:0:20}..."

# Overwrite (idempotent)
R=$(curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session","exercises":[],"updatedAt":"now"}' \
  "$BASE/workout/checkpoint")
check "PUT checkpoint overwrites previous state" "ok" "$R"

# No auth
R=$(curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d "$CHECKPOINT_BODY" \
  "$BASE/workout/checkpoint")
check "PUT checkpoint no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "GET /api/v1/workout/checkpoint — restore"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/checkpoint")
check "GET checkpoint returns state" "ok" "$R"
SESSION_ID_FROM_CHECKPOINT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d.get('sessionId','') if d else 'null')" 2>/dev/null)
echo "       sessionId in checkpoint: $SESSION_ID_FROM_CHECKPOINT"

# No auth
R=$(curl -s "$BASE/workout/checkpoint")
check "GET checkpoint no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "DELETE /api/v1/workout/checkpoint — clear"

R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/workout/checkpoint")
if [ "$R" = "204" ]; then
  pass "DELETE checkpoint clears state (204)"
else
  fail "DELETE checkpoint returned HTTP $R"
fi

# Confirm it's gone (returns null data, not an error)
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/workout/checkpoint")
check "GET checkpoint after DELETE returns null data" "ok" "$R"
NULL_DATA=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'])" 2>/dev/null)
if [ "$NULL_DATA" = "None" ]; then
  pass "GET checkpoint after DELETE — data is null"
else
  fail "GET checkpoint after DELETE — expected null, got: $NULL_DATA"
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
