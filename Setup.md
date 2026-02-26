# Orecce Local Setup Guide

This guide is for collaborators running the Supabase-based stack locally.

## 1) Repo layout

- `apps/mobile/` -> Expo React Native app
- `apps/web/` -> web app for local feed testing
- `services/api/` -> Express API backed by Supabase Postgres/Auth

## 2) Prerequisites

1. Node.js 20+ and npm
2. A Supabase project (URL + service role key)
3. OpenAI API key (optional if using mock mode)

## 3) Clone and install

```bash
git clone https://github.com/sodhera/orecce.git
cd orecce
npm install
```

## 4) API env setup

Create API env file:

```bash
cp services/api/functions/.env.example services/api/functions/.env
```

Set these values in `services/api/functions/.env`:

- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `OPENAI_API_KEY=...` (or set `MOCK_LLM=true`)
- `AI_NEWS_ENABLED=false` (recommended for local testing)

## 5) Run locally

Run API:

```bash
npm --prefix services/api/functions run dev:supabase
```

Run web app:

```bash
npm --prefix apps/web run dev
```

Run mobile app:

```bash
npm --prefix apps/mobile run start
```

## 6) Validation commands

API checks:

```bash
./services/api/scripts/prepush-check.sh
```

Web build check:

```bash
npm --prefix apps/web run build
```

Mobile typecheck:

```bash
npm --prefix apps/mobile run typecheck
```
