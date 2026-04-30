#!/usr/bin/env bash
# Upload PWA web sourcemaps to Firebase Storage for server-side
# symbolication of client error stacks.
#
# Run after `npm run build:pwa`. Safe to re-run. Each invocation creates
# a new deployId folder (timestamp + git short SHA) so digests written
# from a given deploy can resolve against that deploy's maps.
#
# Usage:
#   bash scripts/ops/upload-sourcemaps.sh [project]
# Project resolution order: arg → GCLOUD_PROJECT → FIREBASE_PROJECT_ID → fail.
# Firebase CLI sets GCLOUD_PROJECT when invoking this as a postdeploy hook,
# so the deploy target is auto-detected. No prod default — staging deploys
# previously uploaded into the prod bucket.

set -e

PROJECT="${1:-${GCLOUD_PROJECT:-${FIREBASE_PROJECT_ID:-}}}"
if [ -z "$PROJECT" ]; then
  echo "ERROR: project not specified. Pass as arg or set GCLOUD_PROJECT/FIREBASE_PROJECT_ID." >&2
  exit 1
fi
BUCKET="${PROJECT}.firebasestorage.app"
SOURCE_DIR="${SOURCE_DIR:-hosting/app}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: $SOURCE_DIR not found. Run npm run build:pwa first." >&2
  exit 1
fi

# Find .js.map files under the built PWA directory. If none, bail loudly
# (it means sourcemaps aren't being emitted — fix the Expo/Metro config).
MAPS=$(find "$SOURCE_DIR" -type f -name "*.js.map" 2>/dev/null || true)
if [ -z "$MAPS" ]; then
  echo "WARN: no .js.map files under $SOURCE_DIR — sourcemap upload skipped." >&2
  echo "WARN: PWA stacks will not be server-symbolicated until maps are emitted." >&2
  exit 0
fi

TS=$(date -u +%Y%m%dT%H%M%SZ)
SHA=$(git rev-parse --short=8 HEAD 2>/dev/null || echo "nosha")
DEPLOY_ID="${TS}-${SHA}"
PREFIX="ops/sourcemaps/pwa/${DEPLOY_ID}"

echo "Uploading sourcemaps to gs://${BUCKET}/${PREFIX}/"

COUNT=0
while IFS= read -r map; do
  base=$(basename "$map")
  gsutil -q cp "$map" "gs://${BUCKET}/${PREFIX}/${base}"
  COUNT=$((COUNT + 1))
done <<< "$MAPS"

echo "Uploaded ${COUNT} sourcemap(s) under deployId=${DEPLOY_ID}"
