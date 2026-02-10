#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend/ai-post"
FUNCTIONS_DIR="$BACKEND_DIR/functions"
WEB_DIR="$ROOT_DIR/web"
ENV_FILE="$FUNCTIONS_DIR/.env"
ENV_EXAMPLE_FILE="$FUNCTIONS_DIR/.env.example"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:5001/ai-post-dev/us-central1/api/health}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required."
  exit 1
fi

is_backend_healthy() {
  local response
  response="$(curl -fsS "$BACKEND_HEALTH_URL" 2>/dev/null || true)"
  [[ "$response" == *"\"ok\":true"* ]]
}

port_in_use() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

if [[ ! -f "$ENV_FILE" && -f "$ENV_EXAMPLE_FILE" ]]; then
  cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
  echo "Created $ENV_FILE from .env.example"
fi

if [[ ! -d "$FUNCTIONS_DIR/node_modules" ]]; then
  echo "Installing backend dependencies..."
  npm --prefix "$FUNCTIONS_DIR" ci
fi

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  echo "Installing web dependencies..."
  npm --prefix "$WEB_DIR" install
fi

USE_MOCK="${MOCK_LLM:-}"
if [[ -z "$USE_MOCK" ]]; then
  OPENAI_KEY="$(grep '^OPENAI_API_KEY=' "$ENV_FILE" 2>/dev/null | head -n 1 | cut -d '=' -f2- || true)"
  if [[ -z "$OPENAI_KEY" || "$OPENAI_KEY" == "PASTE_YOUR_OPENAI_API_KEY_HERE" ]]; then
    USE_MOCK="true"
  else
    USE_MOCK="false"
  fi
fi

echo "Starting local stack..."
echo "Backend emulator data: $ROOT_DIR/.firebase-emulator-data"
echo "Web URL: http://127.0.0.1:5173"
echo "Backend URL: http://127.0.0.1:5001/ai-post-dev/us-central1/api"
if [[ "$USE_MOCK" == "true" ]]; then
  echo "LLM mode: MOCK_LLM=true (no OpenAI key required)"
else
  echo "LLM mode: real model"
fi
echo

cleanup() {
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" >/dev/null 2>&1; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

START_BACKEND="yes"
if is_backend_healthy; then
  echo "Detected running backend emulator at $BACKEND_HEALTH_URL"
  echo "Reusing existing backend process."
  START_BACKEND="no"
elif port_in_use 5001 || port_in_use 8080 || port_in_use 4000; then
  echo "Port conflict detected (5001/8080/4000) and no healthy backend found."
  echo "Run: npm run stop:all"
  echo "Then: npm run start:all"
  exit 1
fi

if [[ "$START_BACKEND" == "yes" ]]; then
  (
    cd "$BACKEND_DIR"
    if [[ "$USE_MOCK" == "true" ]]; then
      MOCK_LLM=true ./scripts/start-emulators-local.sh
    else
      ./scripts/start-emulators-local.sh
    fi
  ) &
  BACKEND_PID=$!
fi

npm --prefix "$WEB_DIR" run dev &
WEB_PID=$!

if [[ "$START_BACKEND" == "yes" ]]; then
  wait "$BACKEND_PID" "$WEB_PID"
else
  wait "$WEB_PID"
fi
