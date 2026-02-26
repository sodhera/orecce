# Local Testing

## Required checks before push
```bash
./scripts/prepush-check.sh
```

## Local API run
Use the Supabase-backed server:
```bash
npm --prefix functions run dev:supabase
```

## Real LLM latency check
```bash
OPENAI_MODEL=gpt-5-mini npm --prefix functions run dev:supabase
```

In another terminal:
```bash
BASE=http://127.0.0.1:8787 REQUESTS=20 CONCURRENCY=10 MODE=BIOGRAPHY PROFILE="Bill Gates" LENGTH=short ALLOW_422=false ./scripts/latency-bench.sh
```

## Real LLM scroll simulation (3 users)
Simulates 3 users with read delays (7s, 12s, 17s), preloads 4 posts each, then generates on scroll:
```bash
BASE=http://127.0.0.1:8787 OPENAI_MODEL=gpt-5-mini POST_LOAD=4 SCROLL_ROUNDS=1 MODE=BIOGRAPHY PROFILE="Bill Gates" node ./scripts/scroll-sim-real.mjs
```
