#!/usr/bin/env bash
set -euo pipefail

BASE="http://127.0.0.1:5001/ai-post-dev/us-central1/api"

curl -s -X POST "$BASE/v1/prompt-preferences/set" -H "Content-Type: application/json" \
  -d '{"user_id":"demo-user","biography_instructions":"Focus on widely documented public milestones only. Use under-told high-stakes moments, surprising tradeoffs, and concrete why-it-matters framing for Elon Musk and Bob Iger."}' > /tmp/prefs_demo.json

for i in 1 2 3; do
  curl -s -X POST "$BASE/v1/posts/generate" -H "Content-Type: application/json" \
    -d '{"user_id":"demo-user","mode":"BIOGRAPHY","profile":"Elon Musk","length":"medium"}' > "/tmp/elon_$i.json"
done

for i in 1 2 3; do
  curl -s -X POST "$BASE/v1/posts/generate" -H "Content-Type: application/json" \
    -d '{"user_id":"demo-user","mode":"BIOGRAPHY","profile":"Bob Iger","length":"medium"}' > "/tmp/bob_$i.json"
done

curl -s -X POST "$BASE/v1/posts/list" -H "Content-Type: application/json" \
  -d '{"user_id":"demo-user","mode":"BIOGRAPHY","profile":"Elon Musk","page_size":10}' > /tmp/elon_list.json
curl -s -X POST "$BASE/v1/posts/list" -H "Content-Type: application/json" \
  -d '{"user_id":"demo-user","mode":"BIOGRAPHY","profile":"Bob Iger","page_size":10}' > /tmp/bob_list.json

node <<'NODE'
const fs = require('fs');
const paths = ['/tmp/prefs_demo.json','/tmp/elon_1.json','/tmp/elon_2.json','/tmp/elon_3.json','/tmp/bob_1.json','/tmp/bob_2.json','/tmp/bob_3.json','/tmp/elon_list.json','/tmp/bob_list.json'];
for (const p of paths) {
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!data.ok) {
    console.error('API failure in', p, JSON.stringify(data));
    process.exit(1);
  }
}
const elon = JSON.parse(fs.readFileSync('/tmp/elon_list.json','utf8'));
const bob = JSON.parse(fs.readFileSync('/tmp/bob_list.json','utf8'));
console.log('ELON_COUNT', elon.data.items.length);
elon.data.items.forEach((it, idx) => {
  console.log(`ELON_${idx + 1}_TITLE: ${it.title}`);
  console.log(`ELON_${idx + 1}_CONF: ${it.confidence}`);
  console.log(`ELON_${idx + 1}_BODY: ${it.body}`);
});
console.log('BOB_COUNT', bob.data.items.length);
bob.data.items.forEach((it, idx) => {
  console.log(`BOB_${idx + 1}_TITLE: ${it.title}`);
  console.log(`BOB_${idx + 1}_CONF: ${it.confidence}`);
  console.log(`BOB_${idx + 1}_BODY: ${it.body}`);
});
NODE
