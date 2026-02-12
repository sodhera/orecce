#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
FUNCTIONS_DIR="$API_DIR/functions"
WEB_DIR="$ROOT_DIR/apps/web"
WEB_PORT="${PORT:-3000}"
ENV_FILE="$FUNCTIONS_DIR/.env"
ENV_EXAMPLE_FILE="$FUNCTIONS_DIR/.env.example"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:5001/ai-post-dev/us-central1/api/health}"
DATA_DIR="${FIREBASE_EMULATOR_DATA_DIR:-$ROOT_DIR/infra/local/.firebase-emulator-data}"
LOG_DIR="${LOCAL_STACK_LOG_DIR:-$ROOT_DIR/infra/local/.logs}"
STACK_LOG_FILE="${STACK_LOG_FILE:-$LOG_DIR/start-all.log}"
WEB_LOG_FILE="${WEB_LOG_FILE:-$LOG_DIR/web-dev.log}"

mkdir -p "$DATA_DIR"
mkdir -p "$LOG_DIR"

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

if [[ ! -d "$WEB_DIR/node_modules" ]] || ! npm --prefix "$WEB_DIR" ls next --depth=0 >/dev/null 2>&1; then
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
echo "Backend emulator data: $DATA_DIR"
echo "Web URL: http://127.0.0.1:$WEB_PORT"
echo "Backend URL: http://127.0.0.1:5001/ai-post-dev/us-central1/api"
echo "Log directory: $LOG_DIR"
echo "Stack log: $STACK_LOG_FILE"
echo "Web log: $WEB_LOG_FILE"
if [[ "$USE_MOCK" == "true" ]]; then
  echo "LLM mode: MOCK_LLM=true (no OpenAI key required)"
else
  echo "LLM mode: real model"
fi
echo

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] start-all invoked" >> "$STACK_LOG_FILE"

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
    cd "$API_DIR"
    if [[ "$USE_MOCK" == "true" ]]; then
      MOCK_LLM=true MOCK_LLM_OVERRIDE=true FIREBASE_EMULATOR_DATA_DIR="$DATA_DIR" LOCAL_STACK_LOG_DIR="$LOG_DIR" ./scripts/start-emulators-local.sh
    else
      FIREBASE_EMULATOR_DATA_DIR="$DATA_DIR" LOCAL_STACK_LOG_DIR="$LOG_DIR" ./scripts/start-emulators-local.sh
    fi
  ) > >(tee -a "$STACK_LOG_FILE") 2>&1 &
  BACKEND_PID=$!
fi

npm --prefix "$WEB_DIR" run dev 2>&1 | tee -a "$WEB_LOG_FILE" &
WEB_PID=$!

if [[ "$START_BACKEND" == "yes" ]]; then
  wait "$BACKEND_PID" "$WEB_PID"
else
  wait "$WEB_PID"
fi
