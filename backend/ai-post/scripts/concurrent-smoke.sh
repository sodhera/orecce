#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:5001/ai-post-dev/us-central1/api}"
CONCURRENCY="${CONCURRENCY:-10}"
REQUESTS="${REQUESTS:-30}"
STRICT_SUCCESS="${STRICT_SUCCESS:-false}"

if [[ "$CONCURRENCY" -lt 1 ]]; then
  echo "CONCURRENCY must be >= 1"
  exit 1
fi

if [[ "$REQUESTS" -lt 1 ]]; then
  echo "REQUESTS must be >= 1"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Running concurrent smoke: requests=$REQUESTS concurrency=$CONCURRENCY"

seq 1 "$REQUESTS" | xargs -I{} -P "$CONCURRENCY" bash -c '
  i="$1"
  base="$2"
  out="$3"

  user_id="u$(( ((i - 1) % 10) + 1 ))"
  case $((i % 3)) in
    1)
      mode="BIOGRAPHY"
      profile="Bill Gates"
      ;;
    2)
      mode="TRIVIA"
      profile="physics"
      ;;
    0)
      mode="NICHE"
      profile="2000s nostalgia"
      ;;
  esac

  payload=$(printf "{\"user_id\":\"%s\",\"mode\":\"%s\",\"profile\":\"%s\",\"length\":\"short\"}" "$user_id" "$mode" "$profile")
  code=$(curl -Ls -o "$out/resp_$i.json" -w "%{http_code}" -X POST "$base/v1/posts/generate" -H "Content-Type: application/json" -d "$payload")
  printf "%s" "$code" > "$out/code_$i.txt"
' _ {} "$BASE" "$TMP_DIR"

node -e '
  const fs = require("fs");
  const path = process.argv[1];
  const requestCount = Number(process.argv[2]);
  const strictSuccess = String(process.argv[3]).toLowerCase() === "true";
  const failures = [];
  let successCount = 0;
  let validationRejectCount = 0;
  let bioCount = 0;
  let triviaCount = 0;
  let nicheCount = 0;

  for (let i = 1; i <= requestCount; i++) {
    const code = Number(fs.readFileSync(`${path}/code_${i}.txt`, "utf8"));
    let body;
    try {
      body = JSON.parse(fs.readFileSync(`${path}/resp_${i}.json`, "utf8"));
    } catch (err) {
      failures.push({ i, reason: "invalid-json", code, err: String(err) });
      continue;
    }

    const isSuccess = code === 200 && body?.ok === true && Boolean(body?.data?.id);
    const isAllowedValidationReject =
      !strictSuccess &&
      code === 422 &&
      body?.ok === false &&
      body?.error?.code === "generation_validation_failed";

    if (!isSuccess && !isAllowedValidationReject) {
      failures.push({ i, reason: "bad-response", code, body: body?.error ?? body });
      continue;
    }

    if (isAllowedValidationReject) {
      validationRejectCount += 1;
      continue;
    }

    successCount += 1;
    if (body.data.mode === "BIOGRAPHY") bioCount += 1;
    if (body.data.mode === "TRIVIA") triviaCount += 1;
    if (body.data.mode === "NICHE") nicheCount += 1;
  }

  if (successCount === 0) {
    failures.push({ reason: "no-successful-generations" });
  }

  if (failures.length > 0) {
    console.error("Concurrent smoke failed.");
    console.error(JSON.stringify(failures.slice(0, 5), null, 2));
    process.exit(1);
  }

  console.log(
    `concurrent-smoke-ok requests=${requestCount} success=${successCount} validation_rejects=${validationRejectCount} bio=${bioCount} trivia=${triviaCount} niche=${nicheCount} strict=${strictSuccess}`
  );
 ' "$TMP_DIR" "$REQUESTS" "$STRICT_SUCCESS"

# Verify listing still works after concurrent writes.
curl -Ls -X POST "$BASE/v1/posts/list" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","mode":"BIOGRAPHY","profile":"Bill Gates","page_size":5}' \
  > "$TMP_DIR/list_check.json"

node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (body?.ok !== true || !Array.isArray(body?.data?.items)) {
    console.error("List verification failed.", body);
    process.exit(1);
  }
  console.log(`list-check-ok items=${body.data.items.length}`);
' "$TMP_DIR/list_check.json"

echo "smoke-complete"
