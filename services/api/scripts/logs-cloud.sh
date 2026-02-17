#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-audit-3a7ec}"
LINES="${LINES:-80}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-5}"
FIREBASE_TOOLS_VERSION="${FIREBASE_TOOLS_VERSION:-15.5.1}"

echo "Streaming Firebase function logs for project: $PROJECT_ID"
echo "Watching: api, onAuthUserCreate, syncNewsEvery3Hours"
echo "Refresh interval: ${INTERVAL_SECONDS}s"
echo "Press Ctrl+C to stop."

while true; do
  echo ""
  echo "----- $(date -u +"%Y-%m-%d %H:%M:%S UTC") -----"
  npx --yes "firebase-tools@${FIREBASE_TOOLS_VERSION}" functions:log \
    --project "$PROJECT_ID" \
    --only "api,onAuthUserCreate,syncNewsEvery3Hours" \
    --lines "$LINES" || true
  sleep "$INTERVAL_SECONDS"
done
