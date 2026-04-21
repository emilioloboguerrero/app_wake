#!/usr/bin/env bash
# Register the wakeSignalsWebhook Cloud Function URL with Telegram.
# Run once after initial deploy, and again if the URL changes.
# Safe to re-run — setWebhook is idempotent.
#
# Usage:
#   bash scripts/ops/register-signals-webhook.sh [project]
# Defaults to wolf-20b8b.

set -e

PROJECT="${1:-wolf-20b8b}"
REGION="us-central1"
FUNCTION="wakeSignalsWebhook"

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
  --secret=TELEGRAM_SIGNALS_BOT_TOKEN --project="$PROJECT" 2>/dev/null)"
WEBHOOK_SECRET="$(gcloud secrets versions access latest \
  --secret=TELEGRAM_WEBHOOK_SECRET --project="$PROJECT" 2>/dev/null)"
if [ -z "$BOT_TOKEN" ] || [ -z "$WEBHOOK_SECRET" ]; then
  echo "ERROR: missing TELEGRAM_SIGNALS_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET" >&2
  exit 1
fi

echo "Registering webhook with Telegram..."
RESPONSE="$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=${URL}" \
  --data-urlencode "secret_token=${WEBHOOK_SECRET}" \
  --data-urlencode "allowed_updates=[\"message\"]")"

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "setWebhook: ok"
else
  echo "setWebhook failed: $RESPONSE" >&2
  exit 1
fi

echo "Registering bot commands with Telegram..."
COMMANDS_JSON='{"commands":[
  {"command":"logs","description":"Run the logs digest now (last 24h)"},
  {"command":"heartbeat","description":"Scheduled-job freshness check"},
  {"command":"payments","description":"MercadoPago + subscriptions pulse (24h)"},
  {"command":"quota","description":"Firestore + Functions quotas vs 7d baseline"},
  {"command":"pwa_errors","description":"Frontend errors, PWA (24h)"},
  {"command":"creator_errors","description":"Frontend errors, creator dashboard (24h)"},
  {"command":"all","description":"Run all collectors in sequence"},
  {"command":"agent_pause","description":"Pause the smart agent"},
  {"command":"agent_resume","description":"Resume the smart agent"},
  {"command":"help","description":"List available commands"}
]}'

RESPONSE="$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d "$COMMANDS_JSON")"

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "setMyCommands: ok"
else
  echo "setMyCommands failed (non-fatal): $RESPONSE" >&2
fi

echo "Done. @signals_wake now accepts /logs, /all, /help in the wake_ops group."
