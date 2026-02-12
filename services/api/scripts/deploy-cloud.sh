#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$API_DIR/../.." && pwd)"
WORKSPACE_ROOT="$(cd "$REPO_ROOT/.." && pwd)"

PROJECT_ID="${FIREBASE_PROJECT_ID:-audit-3a7ec}"
SERVICE_ACCOUNT_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-$WORKSPACE_ROOT/audit-3a7ec-4313afabeaac.json}"
FIREBASE_TOOLS_VERSION="${FIREBASE_TOOLS_VERSION:-15.5.1}"

if [[ ! -f "$SERVICE_ACCOUNT_PATH" ]]; then
  echo "Missing service account JSON: $SERVICE_ACCOUNT_PATH" >&2
  echo "Set GOOGLE_APPLICATION_CREDENTIALS or place the JSON at: $WORKSPACE_ROOT" >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required but not found in PATH." >&2
  exit 1
fi

echo "Authenticating gcloud with service account..."
gcloud auth activate-service-account --key-file="$SERVICE_ACCOUNT_PATH" >/dev/null
TOKEN="$(gcloud auth print-access-token)"

echo "Deploying Firebase functions + Firestore config to project: $PROJECT_ID"
cd /tmp
export MOCK_LLM=false
export MOCK_LLM_OVERRIDE=false
npx --yes "firebase-tools@${FIREBASE_TOOLS_VERSION}" deploy \
  --project "$PROJECT_ID" \
  --config "$API_DIR/firebase.json" \
  --only "functions:api,functions:onAuthUserCreate,functions:syncNewsEvery3Hours,firestore:indexes,firestore:rules" \
  --token "$TOKEN" \
  --force
