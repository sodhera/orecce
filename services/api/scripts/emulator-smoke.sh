#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-ai-post-dev}"
BASE="http://127.0.0.1:5001/$PROJECT_ID/us-central1/api"
AUTH_BASE="http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1"
API_KEY="fake-api-key"
EMAIL="${SMOKE_EMAIL:-smoke@orecce.local}"
PASSWORD="${SMOKE_PASSWORD:-Passw0rd!}"

SIGNIN_RESPONSE="$(curl -Ls -X POST "$AUTH_BASE/accounts:signInWithPassword?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"returnSecureToken\":true}")"

ID_TOKEN="$(node -e 'const data=JSON.parse(process.argv[1]||"{}");process.stdout.write(String(data.idToken||""));' "$SIGNIN_RESPONSE")"
if [[ -z "$ID_TOKEN" ]]; then
  SIGNUP_RESPONSE="$(curl -Ls -X POST "$AUTH_BASE/accounts:signUp?key=$API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"returnSecureToken\":true}")"
  ID_TOKEN="$(node -e 'const data=JSON.parse(process.argv[1]||"{}");process.stdout.write(String(data.idToken||""));' "$SIGNUP_RESPONSE")"
fi
if [[ -z "$ID_TOKEN" ]]; then
  echo "failed to obtain auth emulator idToken"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $ID_TOKEN"

curl -Ls "$BASE/health" > /tmp/health.json

curl -Ls -X GET "$BASE/v1/users/me" \
  -H "$AUTH_HEADER" \
  > /tmp/user_me.json

curl -Ls -X POST "$BASE/v1/prompt-preferences/set" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"biography_instructions":"Focus on documented events only.","niche_instructions":"Keep it practical and concise."}' \
  > /tmp/prefs_set.json

curl -Ls -X POST "$BASE/v1/posts/list" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"mode":"BIOGRAPHY","profile":"Steve Jobs","page_size":5}' \
  > /tmp/list_bio.json

curl -Ls -X POST "$BASE/v1/posts/generate" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"mode":"BIOGRAPHY","profile":"Steve Jobs","length":"short"}' \
  > /tmp/gen_bio.json

BIO_ID=$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("/tmp/gen_bio.json","utf8"));process.stdout.write((p?.data?.id||""));')
if [[ -z "$BIO_ID" ]]; then
  echo "missing generated prefill post id"
  exit 1
fi

curl -Ls -X POST "$BASE/v1/posts/feedback" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"post_id\":\"$BIO_ID\",\"feedback_type\":\"upvote\"}" \
  > /tmp/fb.json

curl -Ls -X POST "$BASE/v1/posts/feedback/list" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"page_size":20}' \
  > /tmp/fb_list.json

node -e '
const fs=require("fs");
const required=["/tmp/health.json","/tmp/user_me.json","/tmp/prefs_set.json","/tmp/list_bio.json","/tmp/gen_bio.json","/tmp/fb.json","/tmp/fb_list.json"];
for (const file of required) {
  const parsed=JSON.parse(fs.readFileSync(file,"utf8"));
  if (file === "/tmp/health.json") {
    if (parsed.ok !== true) { console.error("health not ok", parsed); process.exit(1); }
    continue;
  }
  if (parsed.ok !== true) { console.error("request failed", file, parsed); process.exit(1); }
}
const listed=JSON.parse(fs.readFileSync("/tmp/list_bio.json","utf8"));
if (!Array.isArray(listed?.data?.items) || listed.data.items.length < 1) {
  console.error("prefilled list empty");
  process.exit(1);
}
const feedback=JSON.parse(fs.readFileSync("/tmp/fb_list.json","utf8"));
if (!Array.isArray(feedback?.data?.items) || feedback.data.items.length < 1) {
  console.error("feedback list empty");
  process.exit(1);
}
console.log("smoke-ok");
'
