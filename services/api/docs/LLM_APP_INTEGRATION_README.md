# App Integration README (Supabase + Prefilled Feed)

Use this as the integration handoff for mobile/web clients.

## Core behavior
- Users authenticate with Supabase Auth.
- Backend verifies bearer tokens on `/v1/*` and `/users/*` calls.
- Feed content is pre-generated in a shared common dataset and copied once to each user.
- No on-demand LLM generation in feed requests.

## Base URLs
- Local Supabase-backed API: `http://127.0.0.1:8787`
- Production API: your Vercel API origin

## Required headers
- `Authorization: Bearer <supabase-access-token>`
- `Content-Type: application/json` for JSON requests

## Endpoints to use
- `GET /health`
- `GET /v1/users/me`
- `PATCH /v1/users/me`
- `POST /v1/users/me/prefills/regenerate` (optional dev/admin action)
- `POST /v1/prompt-preferences/set`
- `GET /v1/prompt-preferences`
- `POST /v1/posts/list`
- `POST /v1/posts/generate` (returns next prefilled post)
- `POST /v1/posts/generate/stream` (streams chunks from stored post text)
- `POST /v1/posts/feedback`
- `POST /v1/posts/feedback/list`

## Recommended client flow
1. User signs in with Supabase Auth.
2. Call `GET /v1/users/me` after sign-in.
3. Load feed with `POST /v1/posts/list`.
4. For card-by-card flow, call `POST /v1/posts/generate` to step through prefills.
5. Send user actions to `POST /v1/posts/feedback`.
