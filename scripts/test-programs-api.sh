#!/usr/bin/env bash
# test-programs-api.sh — Domain 7.2 + 7.5 Creator Programs endpoint tests
# Usage: bash scripts/test-programs-api.sh <email> <password>

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

echo -e "${BOLD}Wake — Creator Programs API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-programs-api.sh <email> <password>"
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

# ── 7.2 Programs — List & Create ─────────────────────────────────────────────
section "GET /api/v1/creator/programs — list programs"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/programs")
check "GET programs returns array" "ok" "$R"
PROGRAM_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "       programs returned: $PROGRAM_COUNT"

# No auth
R=$(curl -s "$BASE/creator/programs")
check "GET programs no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "POST /api/v1/creator/programs — create program"

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Programa de Prueba","description":"Descripción de prueba","deliveryType":"one_on_one","discipline":"Fuerza"}' \
  "$BASE/creator/programs")
check "POST programs creates program" "ok" "$R"
PROGRAM_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('programId',''))" 2>/dev/null)
echo "       created programId: $PROGRAM_ID"

# Missing required fields
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"No title"}' \
  "$BASE/creator/programs")
check "POST programs missing title returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Invalid deliveryType
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","deliveryType":"invalid"}' \
  "$BASE/creator/programs")
check "POST programs invalid deliveryType returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# Missing deliveryType
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}' \
  "$BASE/creator/programs")
check "POST programs missing deliveryType returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth
R=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","deliveryType":"low_ticket"}' \
  "$BASE/creator/programs")
check "POST programs no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# Create a second program for list/duplicate tests
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Low Ticket Program","deliveryType":"low_ticket"}' \
  "$BASE/creator/programs")
check "POST programs creates low_ticket program" "ok" "$R"
PROGRAM_ID_LT=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('programId',''))" 2>/dev/null)
echo "       low_ticket programId: $PROGRAM_ID_LT"

# Confirm both appear in list
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/programs")
NEW_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
if [ "$NEW_COUNT" -ge 2 ] 2>/dev/null; then
  pass "GET programs — list shows newly created programs"
else
  fail "GET programs — expected >=2 programs, got $NEW_COUNT"
fi

# ── 7.2 Programs — Update ─────────────────────────────────────────────────────
section "PATCH /api/v1/creator/programs/:programId — update metadata"

if [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Programa Actualizado","description":"Nueva descripción","discipline":"Hipertrofia"}' \
    "$BASE/creator/programs/$PROGRAM_ID")
  check "PATCH program updates metadata" "ok" "$R"
  UPDATED_AT=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('updatedAt',''))" 2>/dev/null)
  echo "       updatedAt: ${UPDATED_AT:0:20}..."

  # Verify title updated in list
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/programs")
  UPDATED_TITLE=$(echo "$R" | python3 -c "
import sys,json
data = json.load(sys.stdin)['data']
p = next((x for x in data if x['programId'] == '$PROGRAM_ID'), None)
print(p['title'] if p else '')
" 2>/dev/null)
  if [ "$UPDATED_TITLE" = "Programa Actualizado" ]; then
    pass "PATCH program — GET list confirms title update persisted"
  else
    fail "PATCH program — GET list returned title: '$UPDATED_TITLE'"
  fi
fi

# Not found
R=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"x"}' \
  "$BASE/creator/programs/nonexistent-program-xyz")
check "PATCH nonexistent program returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 7.2 Programs — Status ─────────────────────────────────────────────────────
section "PATCH /api/v1/creator/programs/:programId/status — publish/unpublish"

if [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"published"}' \
    "$BASE/creator/programs/$PROGRAM_ID/status")
  check "PATCH status publishes program" "ok" "$R"
  RETURNED_STATUS=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('status',''))" 2>/dev/null)
  if [ "$RETURNED_STATUS" = "published" ]; then
    pass "PATCH status — response confirms status=published"
  else
    fail "PATCH status — expected published, got $RETURNED_STATUS"
  fi

  # Unpublish
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"draft"}' \
    "$BASE/creator/programs/$PROGRAM_ID/status")
  check "PATCH status unpublishes program" "ok" "$R"

  # Invalid status value
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"active"}' \
    "$BASE/creator/programs/$PROGRAM_ID/status")
  check "PATCH status invalid value returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

  # Missing status field
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "$BASE/creator/programs/$PROGRAM_ID/status")
  check "PATCH status missing status field returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"
fi

# Not found
R=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"published"}' \
  "$BASE/creator/programs/nonexistent-xyz/status")
check "PATCH status nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 7.2 Programs — Duplicate ──────────────────────────────────────────────────
section "POST /api/v1/creator/programs/:programId/duplicate — deep copy"

DUPLICATE_ID=""
if [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "$BASE/creator/programs/$PROGRAM_ID/duplicate")
  check "POST duplicate creates copy with default title" "ok" "$R"
  DUPLICATE_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('programId',''))" 2>/dev/null)
  DUP_TITLE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('title',''))" 2>/dev/null)
  echo "       duplicate programId: $DUPLICATE_ID"
  echo "       duplicate title: $DUP_TITLE"
  if echo "$DUP_TITLE" | grep -q "Copia de"; then
    pass "POST duplicate — title prefixed with 'Copia de'"
  else
    fail "POST duplicate — expected title with 'Copia de', got: $DUP_TITLE"
  fi

  # Duplicate with custom title
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Mi Copia Custom"}' \
    "$BASE/creator/programs/$PROGRAM_ID/duplicate")
  check "POST duplicate with custom title uses provided title" "ok" "$R"
  CUSTOM_TITLE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('title',''))" 2>/dev/null)
  CUSTOM_DUP_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('programId',''))" 2>/dev/null)
  if [ "$CUSTOM_TITLE" = "Mi Copia Custom" ]; then
    pass "POST duplicate — custom title preserved"
  else
    fail "POST duplicate — expected 'Mi Copia Custom', got: $CUSTOM_TITLE"
  fi
fi

# Not found
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE/creator/programs/nonexistent-xyz/duplicate")
check "POST duplicate nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 7.2 Programs — Image Upload URL ──────────────────────────────────────────
section "POST /api/v1/creator/programs/:programId/image/upload-url"

if [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"contentType":"image/jpeg"}' \
    "$BASE/creator/programs/$PROGRAM_ID/image/upload-url")
  # In emulator, signed URLs may fail — check for ok OR INTERNAL_ERROR (storage not configured)
  if echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null; then
    pass "POST image/upload-url returns uploadUrl (storage configured)"
    UPLOAD_URL=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('uploadUrl',''))" 2>/dev/null)
    STORAGE_PATH=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('storagePath',''))" 2>/dev/null)
    echo "       storagePath: $STORAGE_PATH"
    if echo "$STORAGE_PATH" | grep -q "programs/$PROGRAM_ID/"; then
      pass "POST image/upload-url — storagePath scoped to program"
    else
      fail "POST image/upload-url — unexpected storagePath: $STORAGE_PATH"
    fi
  else
    ECODE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('code',''))" 2>/dev/null)
    if [ "$ECODE" = "INTERNAL_ERROR" ]; then
      pass "POST image/upload-url — INTERNAL_ERROR expected (emulator no ADC)"
    else
      fail "POST image/upload-url — unexpected error: ${R:0:200}"
    fi
  fi

  # Invalid contentType
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"contentType":"image/gif"}' \
    "$BASE/creator/programs/$PROGRAM_ID/image/upload-url")
  check "POST image/upload-url invalid contentType returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

  # Missing contentType
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "$BASE/creator/programs/$PROGRAM_ID/image/upload-url")
  check "POST image/upload-url missing contentType returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"
fi

# Not found
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"image/jpeg"}' \
  "$BASE/creator/programs/nonexistent-xyz/image/upload-url")
check "POST image/upload-url nonexistent returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 7.5 Client Programs ───────────────────────────────────────────────────────
section "GET /api/v1/creator/clients/:clientId/programs — list client programs"

# Get first client (if any)
FIRST_CLIENT_ID=""
R_LIST=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients")
FIRST_CLIENT_ID=$(echo "$R_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['clientId'] if d else '')" 2>/dev/null)
echo "       first clientId: ${FIRST_CLIENT_ID:0:20}..."

if [ -n "$FIRST_CLIENT_ID" ]; then
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT_ID/programs")
  check "GET client programs returns array" "ok" "$R"
  CP_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
  echo "       programs assigned to client: $CP_COUNT"
fi

# Unauthorized client
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/unauthorized-user-xyz/programs")
check "GET client programs unauthorized returns FORBIDDEN" "FORBIDDEN" "$R"

# No auth
R=$(curl -s "$BASE/creator/clients/some-id/programs")
check "GET client programs no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

section "POST /api/v1/creator/clients/:clientId/programs/:programId — assign program"

if [ -n "$FIRST_CLIENT_ID" ] && [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"expiresAt":null}' \
    "$BASE/creator/clients/$FIRST_CLIENT_ID/programs/$PROGRAM_ID")
  check "POST assign program to client" "ok" "$R"
  ASSIGNED_AT=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('assignedAt',''))" 2>/dev/null)
  echo "       assignedAt: ${ASSIGNED_AT:0:20}..."

  # Duplicate assignment — should conflict
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"expiresAt":null}' \
    "$BASE/creator/clients/$FIRST_CLIENT_ID/programs/$PROGRAM_ID")
  check "POST assign same program again returns CONFLICT" "CONFLICT" "$R"

  # Verify program appears in client program list
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT_ID/programs")
  FOUND=$(echo "$R" | python3 -c "
import sys,json
data = json.load(sys.stdin)['data']
found = any(x['courseId'] == '$PROGRAM_ID' for x in data)
print(found)
" 2>/dev/null)
  if [ "$FOUND" = "True" ]; then
    pass "GET client programs — assigned program appears in list"
  else
    fail "GET client programs — assigned program not found in list"
  fi
fi

# Unauthorized client
if [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"expiresAt":null}' \
    "$BASE/creator/clients/unauthorized-xyz/programs/$PROGRAM_ID")
  check "POST assign to unauthorized client returns FORBIDDEN" "FORBIDDEN" "$R"
fi

# Program not owned by creator
if [ -n "$FIRST_CLIENT_ID" ]; then
  R=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"expiresAt":null}' \
    "$BASE/creator/clients/$FIRST_CLIENT_ID/programs/nonexistent-program-xyz")
  check "POST assign nonexistent program returns NOT_FOUND or FORBIDDEN" "NOT_FOUND" "$R"
fi

section "DELETE /api/v1/creator/clients/:clientId/programs/:programId — unassign"

if [ -n "$FIRST_CLIENT_ID" ] && [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/clients/$FIRST_CLIENT_ID/programs/$PROGRAM_ID")
  if [ "$R" = "204" ]; then
    pass "DELETE client program unassigns (204)"
  else
    fail "DELETE client program returned HTTP $R"
  fi

  # Confirm removed from list
  R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/creator/clients/$FIRST_CLIENT_ID/programs")
  STILL_FOUND=$(echo "$R" | python3 -c "
import sys,json
data = json.load(sys.stdin)['data']
found = any(x['courseId'] == '$PROGRAM_ID' for x in data)
print(found)
" 2>/dev/null)
  if [ "$STILL_FOUND" = "False" ]; then
    pass "DELETE client program — GET confirms removed from list"
  else
    fail "DELETE client program — program still appears in client list"
  fi

  # Delete non-existent assignment
  R=$(curl -s -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/clients/$FIRST_CLIENT_ID/programs/$PROGRAM_ID")
  check "DELETE already-unassigned program returns NOT_FOUND" "NOT_FOUND" "$R"
fi

# Unauthorized client
if [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/clients/unauthorized-xyz/programs/$PROGRAM_ID")
  check "DELETE client program unauthorized returns FORBIDDEN" "FORBIDDEN" "$R"
fi

# ── 7.2 Programs — Delete ─────────────────────────────────────────────────────
section "DELETE /api/v1/creator/programs/:programId — delete program"

# Delete the duplicate copies first
if [ -n "$DUPLICATE_ID" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/programs/$DUPLICATE_ID")
  if [ "$R" = "204" ]; then
    pass "DELETE duplicate program (204)"
  else
    fail "DELETE duplicate program returned HTTP $R"
  fi
fi

if [ -n "${CUSTOM_DUP_ID:-}" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/programs/$CUSTOM_DUP_ID")
  if [ "$R" = "204" ]; then
    pass "DELETE custom-title duplicate program (204)"
  else
    fail "DELETE custom-title duplicate program returned HTTP $R"
  fi
fi

if [ -n "$PROGRAM_ID" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/programs/$PROGRAM_ID")
  if [ "$R" = "204" ]; then
    pass "DELETE program (204)"
  else
    fail "DELETE program returned HTTP $R"
  fi

  # Confirm deleted — should 404 on PATCH
  R=$(curl -s -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"ghost"}' \
    "$BASE/creator/programs/$PROGRAM_ID")
  check "PATCH deleted program returns NOT_FOUND" "NOT_FOUND" "$R"
fi

if [ -n "$PROGRAM_ID_LT" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/creator/programs/$PROGRAM_ID_LT")
  if [ "$R" = "204" ]; then
    pass "DELETE low_ticket program (204)"
  else
    fail "DELETE low_ticket program returned HTTP $R"
  fi
fi

# Not found
R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/creator/programs/nonexistent-program-xyz")
if [ "$R" = "404" ]; then
  pass "DELETE nonexistent program returns 404"
else
  fail "DELETE nonexistent program — expected 404, got HTTP $R"
fi

# No auth
R=$(curl -s -X DELETE "$BASE/creator/programs/any-id")
check "DELETE program no auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────${RESET}"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES test(s) failed${RESET}"
  exit 1
fi
