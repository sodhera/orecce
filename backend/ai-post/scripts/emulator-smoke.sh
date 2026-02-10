#!/usr/bin/env bash
set -euo pipefail

BASE="http://127.0.0.1:5001/ai-post-dev/us-central1/api"

curl -Ls "$BASE/health" > /tmp/health.json

curl -Ls -X POST "$BASE/v1/prompt-preferences/set" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","biography_instructions":"Founders + public events only","niche_instructions":"2000s internet vibe"}' \
  > /tmp/prefs.json

curl -Ls -X POST "$BASE/v1/posts/generate" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","mode":"BIOGRAPHY","profile":"Steve Jobs","length":"short"}' \
  > /tmp/gen_bio.json

curl -Ls -X POST "$BASE/v1/posts/generate" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","mode":"TRIVIA","profile":"physics","length":"short"}' \
  > /tmp/gen_trivia.json

curl -Ls -X POST "$BASE/v1/posts/generate" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","mode":"NICHE","profile":"2000s nostalgia","length":"short"}' \
  > /tmp/gen_niche.json

BIO_ID=$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("/tmp/gen_bio.json","utf8"));process.stdout.write((p?.data?.id||""));')
if [[ -z "$BIO_ID" ]]; then
  echo "missing bio post id"
  exit 1
fi

curl -Ls -X POST "$BASE/v1/posts/list" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","mode":"BIOGRAPHY","profile":"Steve Jobs","page_size":10}' \
  > /tmp/list_bio.json

curl -Ls -X POST "$BASE/v1/posts/feedback" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"u1\",\"post_id\":\"$BIO_ID\",\"feedback_type\":\"upvote\"}" \
  > /tmp/fb.json

curl -Ls -X POST "$BASE/v1/posts/feedback/list" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","page_size":20}' \
  > /tmp/fb_list.json

node -e 'const fs=require("fs");const files=["/tmp/health.json","/tmp/prefs.json","/tmp/gen_bio.json","/tmp/gen_trivia.json","/tmp/gen_niche.json","/tmp/list_bio.json","/tmp/fb.json","/tmp/fb_list.json"];for(const f of files){const v=JSON.parse(fs.readFileSync(f,"utf8"));if(v.ok!==true){console.error("not ok:",f,v);process.exit(1);}};const list=JSON.parse(fs.readFileSync("/tmp/list_bio.json","utf8"));if(!Array.isArray(list.data.items)||list.data.items.length<1){console.error("list empty");process.exit(1);}const fb=JSON.parse(fs.readFileSync("/tmp/fb_list.json","utf8"));if(!Array.isArray(fb.data.items)||fb.data.items.length<1){console.error("feedback empty");process.exit(1);}console.log("smoke-ok");'
