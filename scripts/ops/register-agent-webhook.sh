#!/usr/bin/env bash
# Register the wakeAgentWebhook Cloud Function URL with Telegram.
# Run once after initial deploy, and again if the URL changes.
# Safe to re-run — setWebhook is idempotent.
#
# Usage:
#   bash scripts/ops/register-agent-webhook.sh [project]
# Defaults to wolf-20b8b.

set -e

PROJECT="${1:-wolf-20b8b}"
REGION="us-central1"
FUNCTION="wakeAgentWebhook"

echo "Resolving function URL..."
URL="$(gcloud functions describe "$FUNCTION" \
  --region="$REGION" --project="$PROJECT" --gen2 \
  --format='value(serviceConfig.uri)' 2>/dev/null)"
if [ -z "$URL" ]; then
  echo "ERROR: could not resolve $FUNCTION URL — has it been deployed?" >&2
  exit 1
fi
echo "URL: $URL"

echo "Fetching secrets..."
BOT_TOKEN="$(gcloud secrets versions access latest \
  --secret=TELEGRAM_AGENT_BOT_TOKEN --project="$PROJECT" 2>/dev/null)"
WEBHOOK_SECRET="$(gcloud secrets versions access latest \
  --secret=TELEGRAM_AGENT_WEBHOOK_SECRET --project="$PROJECT" 2>/dev/null)"
if [ -z "$BOT_TOKEN" ] || [ -z "$WEBHOOK_SECRET" ]; then
  echo "ERROR: missing TELEGRAM_AGENT_BOT_TOKEN or TELEGRAM_AGENT_WEBHOOK_SECRET" >&2
  exit 1
fi

echo "Registering webhook with Telegram..."
RESPONSE="$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=${URL}" \
  --data-urlencode "secret_token=${WEBHOOK_SECRET}" \
  --data-urlencode "allowed_updates=[\"message\",\"edited_message\"]")"

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "setWebhook: ok"
else
  echo "setWebhook failed: $RESPONSE" >&2
  exit 1
fi

echo "Done. @agent_wake_bot now receives every message in the wake_ops group."
