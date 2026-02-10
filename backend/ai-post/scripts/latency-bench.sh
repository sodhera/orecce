#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:5001/ai-post-dev/us-central1/api}"
REQUESTS="${REQUESTS:-20}"
CONCURRENCY="${CONCURRENCY:-10}"
MODE="${MODE:-TRIVIA}"
PROFILE="${PROFILE:-physics}"
LENGTH="${LENGTH:-short}"
USER_PREFIX="${USER_PREFIX:-bench-u}"
ALLOW_422="${ALLOW_422:-true}"

if [[ "$REQUESTS" -lt 1 ]]; then
  echo "REQUESTS must be >= 1"
  exit 1
fi

if [[ "$CONCURRENCY" -lt 1 ]]; then
  echo "CONCURRENCY must be >= 1"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Benchmarking: mode=$MODE profile=$PROFILE requests=$REQUESTS concurrency=$CONCURRENCY"

seq 1 "$REQUESTS" | xargs -I{} -P "$CONCURRENCY" bash -c '
  idx="$1"
  base="$2"
  out="$3"
  mode="$4"
  profile="$5"
  length="$6"
  user_prefix="$7"

  user_id="${user_prefix}$(( ((idx - 1) % 10) + 1 ))"
  payload=$(printf "{\"user_id\":\"%s\",\"mode\":\"%s\",\"profile\":\"%s\",\"length\":\"%s\"}" "$user_id" "$mode" "$profile" "$length")

  s=$(node -e "process.stdout.write(String(Date.now()))")
  code=$(curl -sS -o "$out/resp_${idx}.json" -w "%{http_code}" -X POST "$base/v1/posts/generate" -H "Content-Type: application/json" -d "$payload" || true)
  e=$(node -e "process.stdout.write(String(Date.now()))")

  printf "%s,%s\n" "$((e - s))" "$code" > "$out/time_${idx}.txt"
' _ {} "$BASE" "$TMP_DIR" "$MODE" "$PROFILE" "$LENGTH" "$USER_PREFIX"

node -e '
  const fs = require("fs");
  const dir = process.argv[1];
  const requestCount = Number(process.argv[2]);
  const allow422 = String(process.argv[3]).toLowerCase() === "true";
  const mode = process.argv[4];
  const profile = process.argv[5];
  const latencies = [];
  const successLatencies = [];
  const codes = {};
  let successCount = 0;
  let validationRejects = 0;
  const failures = [];

  for (let i = 1; i <= requestCount; i++) {
    const [msRaw, codeRaw] = fs.readFileSync(`${dir}/time_${i}.txt`, "utf8").trim().split(",");
    const ms = Number(msRaw);
    const code = Number(codeRaw);
    latencies.push(ms);
    codes[code] = (codes[code] || 0) + 1;

    let body;
    try {
      body = JSON.parse(fs.readFileSync(`${dir}/resp_${i}.json`, "utf8"));
    } catch (err) {
      failures.push({ i, code, reason: "invalid-json", err: String(err) });
      continue;
    }

    const ok200 = code === 200 && body?.ok === true && Boolean(body?.data?.id);
    const is422 =
      allow422 &&
      code === 422 &&
      body?.ok === false &&
      body?.error?.code === "generation_validation_failed";

    if (ok200) {
      successCount += 1;
      successLatencies.push(ms);
      continue;
    }

    if (is422) {
      validationRejects += 1;
      continue;
    }

    failures.push({ i, code, reason: body?.error?.code ?? "unexpected-response" });
  }

  const sortNum = (arr) => arr.slice().sort((a, b) => a - b);
  const pct = (arr, p) => {
    if (!arr.length) return null;
    const s = sortNum(arr);
    const idx = Math.max(0, Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1));
    return s[idx];
  };
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  const summary = {
    mode,
    profile,
    requests: requestCount,
    concurrency: Number(process.env.CONCURRENCY || 0),
    codes,
    success_count: successCount,
    validation_reject_count: validationRejects,
    failure_count: failures.length,
    latency_all_ms: {
      min: sortNum(latencies)[0],
      p50: pct(latencies, 50),
      p95: pct(latencies, 95),
      max: sortNum(latencies)[latencies.length - 1],
      avg: avg(latencies)
    },
    latency_success_ms: {
      min: successLatencies.length ? sortNum(successLatencies)[0] : null,
      p50: pct(successLatencies, 50),
      p95: pct(successLatencies, 95),
      max: successLatencies.length ? sortNum(successLatencies)[successLatencies.length - 1] : null,
      avg: avg(successLatencies)
    },
    sample_failures: failures.slice(0, 5)
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0 || successCount === 0) {
    process.exit(1);
  }
' "$TMP_DIR" "$REQUESTS" "$ALLOW_422" "$MODE" "$PROFILE"
