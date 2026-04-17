#!/usr/bin/env bash
# wake-deploys-notify
# Invoked as a firebase postdeploy hook. See docs/WAKE_OPS.md.
# Usage: bash scripts/ops/notify-deploy.sh <target>

TARGET="${1:-unknown}"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "[notify-deploy] not a git repo, skipping notification" >&2
  exit 0
fi
cd "$REPO_ROOT" || exit 0

ENV_FILE="$REPO_ROOT/.env.ops"
if [ ! -f "$ENV_FILE" ]; then
  echo "[notify-deploy] .env.ops missing at repo root, skipping notification" >&2
  exit 0
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${TELEGRAM_SIGNALS_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "[notify-deploy] missing TELEGRAM_SIGNALS_BOT_TOKEN or TELEGRAM_CHAT_ID in .env.ops" >&2
  exit 0
fi

TREE_STATUS="$(git status --porcelain)"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M')"

if [ -n "$TREE_STATUS" ]; then
  git add -A
  if ! git commit -m "deploy(${TARGET}): ${TIMESTAMP}" > /dev/null 2>&1; then
    echo "[notify-deploy] git commit failed, reporting current HEAD" >&2
  fi
fi

if ! git push origin HEAD > /dev/null 2>&1; then
  echo "[notify-deploy] git push failed (continuing anyway)" >&2
fi

COMMIT_HASH="$(git rev-parse --short HEAD 2>/dev/null)"
COMMIT_SUBJECT="$(git log -1 --pretty=%s 2>/dev/null)"
AUTHOR="$(git log -1 --pretty=%an 2>/dev/null)"

FIREBASE_PROJECT="$(firebase use 2>/dev/null | tail -1)"
[ -z "$FIREBASE_PROJECT" ] && FIREBASE_PROJECT="unknown"

MSG="[wake-deploys] ${TARGET} · deployed
commit ${COMMIT_HASH} — \"${COMMIT_SUBJECT}\"
by ${AUTHOR} · ${FIREBASE_PROJECT}"

TG_RESPONSE="$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_SIGNALS_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${MSG}" 2>&1)"

if echo "$TG_RESPONSE" | grep -q '"ok":true'; then
  echo "[notify-deploy] ${TARGET} (${COMMIT_HASH}) posted to wake_ops" >&2
else
  echo "[notify-deploy] telegram post failed: $TG_RESPONSE" >&2
fi

exit 0
