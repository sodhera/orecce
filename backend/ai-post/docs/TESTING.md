# Local Testing

## Required checks before push
```bash
./scripts/prepush-check.sh
```

## Emulator smoke test
1. Start emulator:
```bash
firebase emulators:start --only functions,firestore
```
2. Open `local-dev-ui/index.html` in a browser.
3. Save preferences, generate post, list posts, send feedback, list feedback.

## Automated emulator smoke test
This runs all core endpoints end-to-end with a local mock LLM:
```bash
MOCK_LLM=true firebase emulators:exec --only functions,firestore "./scripts/emulator-smoke.sh"
```

## Real LLM latency check (no emulator)
Use the lightweight in-memory server to iterate quickly on prompt/gateway behavior:
```bash
OPENAI_MODEL=gpt-5-mini npm --prefix functions run dev:server
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
