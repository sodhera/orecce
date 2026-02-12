# AI-Post Firebase Prototype Backend

Minimal Firebase backend for an AI-generated social feed (BIOGRAPHY / TRIVIA / NICHE), designed for direct mobile app consumption.

## What is included
- Firebase Cloud Functions (HTTP + CORS)
- Firestore persistence for:
  - generated posts
  - feedback (upvote/downvote/skip)
  - user prompt preferences for biography + niche modes
- Scheduled RSS ingestion for source-attributed external news
- LLM gateway module (single location for model calls)
- Tests with mocked LLM (no external API calls)
- Local throwaway frontend for manual testing (git-ignored)

## API summary
Base URL in emulator:
`http://127.0.0.1:5001/<firebase-project-id>/us-central1/api`

Endpoints:
- `POST /v1/posts/generate`
- `POST /v1/posts/generate/stream` (SSE stream: `start`, `chunk`, `post`, `done`)
- `POST /v1/posts/list`
- `POST /v1/posts/feedback`
- `POST /v1/posts/feedback/list`
- `POST /v1/prompt-preferences/set`
- `GET /v1/prompt-preferences?user_id=<id>`
- `GET /health`

Background jobs:
- `syncNewsEvery3Hours` (Cloud Scheduler: every 3 hours, 60s timeout)
  - Ingests latest stories from configured RSS sources
  - Stores normalized records in `newsArticles`
  - Stores full article text in `newsArticleTextChunks` (chunked, verbatim extraction from source pages)
  - Stores per-source sync health in `newsSourceState`
  - Stores run-level audit summaries in `newsSyncRuns`

Detailed API contracts: `docs/API.md`
Machine-readable OpenAPI spec: `docs/openapi.yaml`

LLM app-connection handoff: `docs/LLM_APP_INTEGRATION_README.md`

## Setup
1. Install deps:
```bash
npm --prefix functions install
```

2. Configure env for emulator (`functions/.env`):
```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
# optional for local testing without external API calls
MOCK_LLM=true

# optional news sync tuning
NEWS_SYNC_ENABLED=true
NEWS_MAX_SOURCES_PER_RUN=12
NEWS_MAX_ARTICLES_PER_SOURCE=25
NEWS_SOURCE_CONCURRENCY=4
NEWS_FEED_TIMEOUT_MS=8000
NEWS_FETCH_FULL_TEXT=true
NEWS_ARTICLE_TIMEOUT_MS=12000
NEWS_ARTICLE_CONCURRENCY=2
NEWS_CRAWLER_USER_AGENT="OrecceNewsBot/1.0 (+https://orecce.local/news-ingest)"
```

3. (Optional deploy config) Set Firebase runtime config:
```bash
firebase functions:config:set openai.key="your_key_here" openai.model="gpt-5.2-2025-12-11"
```

4. Build + test:
```bash
npm --prefix functions run lint:types
npm --prefix functions test
npm --prefix functions run build
```

5. Run emulator:
```bash
firebase emulators:start --only functions,firestore
```

To persist emulator Firestore/function state locally on disk:
```bash
./scripts/start-emulators-local.sh
```

## Faster iteration (no emulator)
If you're iterating on prompt quality, you don't need Firebase emulation at all.

1. Run a local dev API server backed by an in-memory DB:
```bash
npm --prefix functions run dev:server
```

Then point `local-dev-ui/index.html` at `http://127.0.0.1:8787` (default).

2. Or generate a post directly (no HTTP server):
```bash
npm --prefix functions run dev:generate -- --mode BIOGRAPHY --profile "Steve Jobs" --length short
```

Generate 3 single posts (no multi-sample batching) for Bill Gates:
```bash
OPENAI_MODEL=gpt-5-mini npm --prefix functions run dev:generate -- --mode BIOGRAPHY --profile "Bill Gates" --length short --count 3 --json
```

Tip: keep tests running while you tweak prompts/validators:
```bash
npm --prefix functions run test:watch
```

Real LLM load check without emulator (10 concurrent requests):
```bash
OPENAI_MODEL=gpt-5-mini npm --prefix functions run dev:server
BASE=http://127.0.0.1:8787 REQUESTS=20 CONCURRENCY=10 MODE=BIOGRAPHY PROFILE="Bill Gates" LENGTH=short ALLOW_422=false ./scripts/latency-bench.sh
```

## Faster emulator workflow (when you do need it)
If you need Firestore persistence behavior, start the emulator once and keep it running; it hot-reloads Functions on code changes:
```bash
firebase emulators:start --only functions,firestore
```

Optional automated smoke check:
```bash
MOCK_LLM=true firebase emulators:exec --only functions,firestore "./scripts/emulator-smoke.sh"
```

Concurrent generation smoke check (10 concurrent users style burst):
```bash
MOCK_LLM=true firebase emulators:exec --only functions,firestore "./scripts/concurrent-smoke.sh"
```

You can tune load via env vars:
```bash
CONCURRENCY=10 REQUESTS=50 MOCK_LLM=true firebase emulators:exec --only functions,firestore "./scripts/concurrent-smoke.sh"
```

Real-LLM scroll simulation (3 users, 4 preloaded posts each, then scroll with 7s/12s/17s read speeds):
```bash
OPENAI_MODEL=gpt-5-mini firebase emulators:exec --only functions,firestore "node ./scripts/scroll-sim-real.mjs"
```

Real-LLM scroll simulation without emulator:
```bash
OPENAI_MODEL=gpt-5-mini npm --prefix functions run dev:server
BASE=http://127.0.0.1:8787 POST_LOAD=4 SCROLL_ROUNDS=1 MODE=BIOGRAPHY PROFILE="Bill Gates" node ./scripts/scroll-sim-real.mjs
```

## Deploy
```bash
npm --prefix functions run build
firebase deploy --only functions,firestore:indexes,firestore:rules
```

## App integration quickstart
1. Use stable `user_id` per device/account in your client.
2. On feed open, call `POST /v1/posts/list` for the selected `(user_id, mode, profile)`.
3. If feed is empty or near end, call `POST /v1/posts/generate/stream`.
4. Render `chunk` events for progressive UI; finalize using `post` event payload.
5. Send `POST /v1/posts/feedback` on upvote/downvote/skip.
6. Update preferences with `POST /v1/prompt-preferences/set`.

For full mobile/LLM implementation guidance, use `docs/LLM_APP_INTEGRATION_README.md`.

## Local manual UI (untracked)
Create/use files under `/local-dev-ui` for quick endpoint testing. This path is in `.gitignore` by design.

## Notes on safety rules
- BIOGRAPHY prompt asks for public, documented turning points and avoids invented private scenes.
- Outputs are normalized to required fields (`title`, `body`, `post_type`, `tags`, `confidence`, `uncertainty_note`).
- For speed and iteration, strict rejection/regeneration validation is disabled in the service path.
