#!/usr/bin/env bash
# test-profile-api.sh — Domain 2 Profile endpoint tests
# Usage: bash scripts/test-profile-api.sh

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
fail() { echo -e "${RED}✗ FAIL${RESET}  $1"; }
section() { echo -e "\n${BOLD}${YELLOW}── $1 ──${RESET}"; }

# ── Get credentials ───────────────────────────────────────────────────────────
echo -e "${BOLD}Wake — Profile API Test Suite${RESET}"

if [ $# -ge 2 ]; then
  EMAIL="$1"
  PASSWORD="$2"
else
  echo "Usage: bash scripts/test-profile-api.sh <email> <password>"
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

AUTH="-H \"Authorization: Bearer ${TOKEN}\""

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
      fail "$label — unexpected response: ${response:0:120}"
    fi
  else
    if [ "$actual_code" = "$expected_status" ]; then
      pass "$label (got $actual_code)"
    else
      fail "$label — expected $expected_status, got: ${response:0:120}"
    fi
  fi
}

# ── 1. GET /users/me ──────────────────────────────────────────────────────────
section "GET /api/v1/users/me"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/users/me")
check "Returns profile data" "ok" "$R"

# Print profile summary
USER_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['userId'])" 2>/dev/null)
DISPLAY_NAME=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('displayName') or '')" 2>/dev/null)
ROLE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['role'])" 2>/dev/null)
echo "       userId: $USER_ID"
echo "       displayName: $DISPLAY_NAME"
echo "       role: $ROLE"

# No auth → 401
R=$(curl -s "$BASE/users/me")
check "No auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 2. PATCH /users/me ────────────────────────────────────────────────────────
section "PATCH /api/v1/users/me"

R=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Test API User","country":"CO","city":"Medellín","height":175,"weight":70}' \
  "$BASE/users/me")
check "Updates fields successfully" "ok" "$R"

# Verify GET reflects the update
R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/users/me")
CITY=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('city') or '')" 2>/dev/null)
if [ "$CITY" = "Medellín" ]; then
  pass "GET reflects PATCH update (city=Medellín)"
else
  fail "GET did not reflect PATCH update (got city='$CITY')"
fi

# Bad birthDate format → 400
R=$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"birthDate":"not-a-date"}' \
  "$BASE/users/me")
check "Invalid birthDate returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth → 401
R=$(curl -s -X PATCH \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Hacker"}' \
  "$BASE/users/me")
check "No auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 3. Profile picture — upload-url ──────────────────────────────────────────
section "POST /api/v1/users/me/profile-picture/upload-url"

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"image/jpeg"}' \
  "$BASE/users/me/profile-picture/upload-url")
check "Returns signed upload URL" "ok" "$R"

UPLOAD_URL=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['uploadUrl'])" 2>/dev/null)
STORAGE_PATH=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['storagePath'])" 2>/dev/null)
EXPIRES_AT=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['expiresAt'])" 2>/dev/null)
echo "       storagePath: $STORAGE_PATH"
echo "       expiresAt: $EXPIRES_AT"

# Bad contentType → 400
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"image/gif"}' \
  "$BASE/users/me/profile-picture/upload-url")
check "Invalid contentType returns VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# No auth → 401
R=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"contentType":"image/jpeg"}' \
  "$BASE/users/me/profile-picture/upload-url")
check "No auth returns UNAUTHENTICATED" "UNAUTHENTICATED" "$R"

# ── 4. Profile picture — upload to signed URL ─────────────────────────────────
section "PUT signed URL (GCS upload)"

# Create a minimal valid JPEG (1x1 white pixel) via Python
JPEG_FILE=$(mktemp /tmp/test-profile-XXXXXX).jpg
python3 -c "
import struct
# Minimal 1x1 white JPEG
data = bytes([
  0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
  0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
  0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
  0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,
  0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,
  0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
  0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,
  0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
  0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xC4,0x00,0xB5,0x10,0x00,0x02,0x01,0x03,
  0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7D,0x01,0x02,0x03,0x00,
  0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,
  0x81,0x91,0xA1,0x08,0x23,0x42,0xB1,0xC1,0x15,0x52,0xD1,0xF0,0x24,0x33,0x62,0x72,
  0x82,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xFB,0xFF,0xD9
])
import sys
sys.stdout.buffer.write(data)
" > "$JPEG_FILE"

UPLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  -H "Content-Type: image/jpeg" \
  --data-binary "@${JPEG_FILE}" \
  "$UPLOAD_URL")

rm -f "$JPEG_FILE"

if [ "$UPLOAD_STATUS" = "200" ]; then
  pass "File uploaded to signed URL (HTTP $UPLOAD_STATUS)"
else
  fail "Signed URL upload failed (HTTP $UPLOAD_STATUS)"
fi

# ── 5. Profile picture — confirm ─────────────────────────────────────────────
section "POST /api/v1/users/me/profile-picture/confirm"

R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"storagePath\":\"${STORAGE_PATH}\"}" \
  "$BASE/users/me/profile-picture/confirm")
check "Confirm returns profilePictureUrl" "ok" "$R"

PHOTO_URL=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['profilePictureUrl'])" 2>/dev/null)
if [[ "$PHOTO_URL" == https://firebasestorage* ]]; then
  pass "profilePictureUrl is a valid Firebase Storage URL"
else
  fail "profilePictureUrl looks wrong: $PHOTO_URL"
fi

# Wrong user path → 403
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"storagePath":"profiles/someoneelse-uid/profile.jpg"}' \
  "$BASE/users/me/profile-picture/confirm")
check "Wrong user path returns FORBIDDEN" "FORBIDDEN" "$R"

# Nonexistent file → 404
R=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"storagePath\":\"profiles/${USER_ID}/doesnotexist.jpg\"}" \
  "$BASE/users/me/profile-picture/confirm")
check "Nonexistent file returns NOT_FOUND" "NOT_FOUND" "$R"

# ── 6. Verify GET reflects photo update ───────────────────────────────────────
section "End-to-end verification"

R=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/users/me")
FINAL_PHOTO=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('profilePictureUrl') or '')" 2>/dev/null)
if [[ "$FINAL_PHOTO" == https://firebasestorage* ]]; then
  pass "GET /users/me reflects new profilePictureUrl"
else
  fail "GET /users/me missing profilePictureUrl (got '$FINAL_PHOTO')"
fi

echo -e "\n${BOLD}Done.${RESET}"
