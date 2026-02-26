# Orecce Monorepo

This repo is split into clean monorepo domains:

- `apps/mobile/` - Expo React Native app
- `apps/web/` - Next.js web app (deployed on Vercel)
- `services/api/` - Express API (deployed on Vercel serverless)

## Backend/Auth/DB stack

- Backend runtime: **Vercel**
- Database: **Supabase Postgres**
- Auth: **Supabase Auth (JWT bearer tokens)**
- API runtime and data/auth paths are Supabase-only.

## Local setup

1. Clone and enter the repo:
   - `git clone https://github.com/sodhera/orecce.git`
   - `cd orecce`
2. Install dependencies for the area you are working in.
3. Create API env file:
   - `cp services/api/functions/.env.example services/api/functions/.env`
4. Set at least these API env vars in `services/api/functions/.env`:
   - `SUPABASE_URL=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
   - `OPENAI_API_KEY=...`
   - `AI_NEWS_ENABLED=false`

## Run locally

### Web app
- `npm --prefix apps/web install`
- `npm --prefix apps/web run dev`

### API (Supabase)
- `npm --prefix services/api/functions install`
- `npm --prefix services/api/functions run dev:supabase`

### Checks
- Web build: `npm --prefix apps/web run build`
- API checks: `./services/api/scripts/prepush-check.sh`

## Production deploy on push

### API workflow
- File: `.github/workflows/deploy-api-vercel.yml`
- Trigger: push to `main` when `services/api/functions/**` changes
- Required GitHub secrets:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_API_PROJECT_ID`
- API env vars must be configured in the Vercel API project:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL` (optional)
  - `AI_NEWS_ENABLED=false`

### Web workflow
- File: `.github/workflows/deploy-web.yml`
- Trigger: push to `main` when `apps/web/**` changes
- Required GitHub secrets:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
- Required GitHub variable:
  - `API_BACKEND_BASE_URL` (API origin, without `/v1`)
- Web env vars must be configured in the Vercel web project:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Integration docs

- API contract: `services/api/docs/API.md`
- OpenAPI spec: `services/api/docs/openapi.yaml`
- LLM handoff doc: `services/api/docs/LLM_APP_INTEGRATION_README.md`
