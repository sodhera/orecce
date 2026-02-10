#!/usr/bin/env bash
set -euo pipefail

if ! command -v firebase >/dev/null 2>&1; then
  echo "firebase CLI is required. Install with: npm i -g firebase-tools"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
DATA_DIR="${FIREBASE_EMULATOR_DATA_DIR:-$ROOT_DIR/.firebase-emulator-data}"
mkdir -p "$DATA_DIR"

echo "Starting emulators with local persistence:"
echo "  data dir: $DATA_DIR"
echo
echo "Functions: http://127.0.0.1:5001"
echo "Firestore: http://127.0.0.1:8080"
echo

firebase emulators:start \
  --only functions,firestore \
  --import="$DATA_DIR" \
  --export-on-exit="$DATA_DIR"
