#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd "$(dirname "$0")/.." && pwd)"

npm --prefix "$API_DIR/functions" run lint:types
npm --prefix "$API_DIR/functions" test
npm --prefix "$API_DIR/functions" run build

echo "Pre-push checks passed."
