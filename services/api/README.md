# Orecce API (Supabase)

Supabase/Postgres-backed API for feed generation, recommendations, and sports/news endpoints.

## Stack
- Runtime: Vercel serverless (`services/api/functions/api/index.ts`)
- Database: Supabase Postgres
- Auth: Supabase Auth bearer tokens

## Core endpoints
- `GET /health`
- `GET /v1/users/me`
- `PATCH /v1/users/me`
- `POST /v1/posts/generate`
- `POST /v1/posts/generate/stream`
- `POST /v1/posts/list`
- `POST /v1/posts/feedback`
- `POST /v1/posts/feedback/list`
- `POST /v1/recommendations/recces`
- `POST /v1/recommendations/recces/interaction`
- `GET /v1/news/sports/feed`
- `POST /v1/news/sports/refresh`

## Local setup
1. Install dependencies:
```bash
npm --prefix functions install
```

2. Configure env in `functions/.env`:
```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
AI_NEWS_ENABLED=false
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

3. Run API locally (Supabase-backed):
```bash
npm --prefix functions run dev:supabase
```

## Checks
Run before push:
```bash
./scripts/prepush-check.sh
```

This runs:
- `npm --prefix functions run lint:types`
- `npm --prefix functions test`
- `npm --prefix functions run build`

## Useful local scripts
- Recces simulation:
```bash
BASE=http://127.0.0.1:8787 ROUNDS=10 LIMIT=8 node ./scripts/recces-scroll-sim.mjs
```
- Concurrent smoke:
```bash
BASE=http://127.0.0.1:8787 ./scripts/concurrent-smoke.sh
```
- Latency bench:
```bash
BASE=http://127.0.0.1:8787 ./scripts/latency-bench.sh
```

## Deploy
API deploy is handled by:
- `.github/workflows/deploy-api-vercel.yml`

That workflow deploys `services/api/functions` to Vercel.
