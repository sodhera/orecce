#!/usr/bin/env bash
set -euo pipefail

npm --prefix functions run lint:types
npm --prefix functions test
npm --prefix functions run build

echo "Pre-push checks passed."
