#!/usr/bin/env bash
set -euo pipefail

PORTS=(5173 5001 8080 4000 4400 4401 4500 4501)
PIDS=()

for port in "${PORTS[@]}"; do
  while IFS= read -r pid; do
    if [[ -n "$pid" ]]; then
      PIDS+=("$pid")
    fi
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
done

if [[ "${#PIDS[@]}" -eq 0 ]]; then
  echo "No local stack processes found on expected ports."
  exit 0
fi

UNIQUE_PIDS_RAW="$(printf "%s\n" "${PIDS[@]}" | sort -u)"
echo "Stopping processes: $UNIQUE_PIDS_RAW"

while IFS= read -r pid; do
  [[ -z "$pid" ]] && continue
  kill "$pid" 2>/dev/null || true
done <<< "$UNIQUE_PIDS_RAW"

sleep 1

while IFS= read -r pid; do
  [[ -z "$pid" ]] && continue
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
done <<< "$UNIQUE_PIDS_RAW"

echo "Done."
