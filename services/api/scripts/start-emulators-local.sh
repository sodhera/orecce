#!/usr/bin/env bash
set -euo pipefail

if ! command -v firebase >/dev/null 2>&1; then
  echo "firebase CLI is required. Install with: npm i -g firebase-tools"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
EMULATOR_WORKDIR="$ROOT_DIR/infra/local"
PROJECT_ID="${FIREBASE_PROJECT_ID:-ai-post-dev}"
DATA_DIR="${FIREBASE_EMULATOR_DATA_DIR:-$ROOT_DIR/infra/local/.firebase-emulator-data}"
LOG_DIR="${LOCAL_STACK_LOG_DIR:-$ROOT_DIR/infra/local/.logs}"
EMULATOR_LOG_FILE="${EMULATOR_LOG_FILE:-$LOG_DIR/firebase-emulators.log}"
FIREBASE_CONFIG_FILE="${FIREBASE_CONFIG_FILE:-$API_DIR/firebase.json}"
mkdir -p "$EMULATOR_WORKDIR"
mkdir -p "$DATA_DIR"
mkdir -p "$LOG_DIR"

echo "Starting emulators with local persistence:"
echo "  project id: $PROJECT_ID"
echo "  config: $FIREBASE_CONFIG_FILE"
echo "  cwd: $EMULATOR_WORKDIR"
echo "  data dir: $DATA_DIR"
echo "  log file: $EMULATOR_LOG_FILE"
echo
echo "Functions: http://127.0.0.1:5001"
echo "Firestore: http://127.0.0.1:8080"
echo

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] starting firebase emulators" >> "$EMULATOR_LOG_FILE"

(
  cd "$EMULATOR_WORKDIR"
  firebase emulators:start \
    --project="$PROJECT_ID" \
    --config="$FIREBASE_CONFIG_FILE" \
    --only functions,firestore \
    --import="$DATA_DIR" \
    --export-on-exit="$DATA_DIR" \
    --debug
) 2>&1 | tee -a "$EMULATOR_LOG_FILE"
