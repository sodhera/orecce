# LLM App Integration README

Use this file as the handoff spec when asking an LLM/coding agent to connect a mobile app (Android/iOS) to this backend.

## Goal
Build a feed client that:
- requests generated posts on demand,
- supports streaming generation for better UX,
- paginates prior posts,
- records feedback,
- stores/updates per-user biography and niche preferences.

## Backend base URLs
- Firebase emulator: `http://127.0.0.1:5001/<firebase-project-id>/us-central1/api`
- Local fast dev server (no Firebase): `http://127.0.0.1:8787`

## Request/response conventions
- All JSON responses use `{ ok: boolean, data?: ..., error?: ... }`.
- On errors, read `error.code`, `error.message`, `error.details`.
- No auth required in v0. Always send a stable `user_id` from app storage.

## API endpoints to use
- `GET /health`
- `POST /v1/prompt-preferences/set`
- `GET /v1/prompt-preferences?user_id=<id>`
- `POST /v1/posts/generate`
- `POST /v1/posts/generate/stream`
- `POST /v1/posts/list`
- `POST /v1/posts/feedback`
- `POST /v1/posts/feedback/list`

See full payload examples in `docs/API.md`.
Use machine-readable spec for codegen tooling: `docs/openapi.yaml`.

## Feed modes and profile mapping
- `BIOGRAPHY`: profile is person name (example: `Steve Jobs`)
- `TRIVIA`: profile is domain (example: `physics`)
- `NICHE`: profile is niche label (example: `2000s nostalgia`)

## Recommended mobile flow
1. On mode/profile selection, call `POST /v1/posts/list` for existing posts.
2. If list is empty, call `POST /v1/posts/generate/stream` and render chunks as they arrive.
3. Keep a local feed buffer target (example: 4 posts ahead).
4. On scroll-near-end, request one more generated post.
5. On user action, send feedback (`upvote`, `downvote`, `skip`).
6. Persist and reuse `nextCursor` for pagination.

## Streaming contract (`/v1/posts/generate/stream`)
Server-sent events:
- `start`: metadata for request
- `chunk`: incremental text, shape `{ "delta": "..." }`
- `post`: final saved post object, shape `{ "ok": true, "data": { ... } }`
- `done`: completion marker
- `error`: structured error object

Client rule:
- Render `chunk.delta` progressively.
- Replace temporary text with `post.data` when `post` arrives.
- Consider request successful only after `post` and/or `done`.

## Post object contract
Every generated post includes:
- `id`
- `userId`
- `mode`
- `profile`
- `profileKey`
- `length`
- `title`
- `body`
- `post_type`
- `tags`
- `confidence` (`high` | `medium` | `low`)
- `uncertainty_note` (`string | null`)
- `createdAtMs`

## Reliability + retry behavior for app
- Retry only idempotent reads (`/health`, `/posts/list`, `/feedback/list`, `/prompt-preferences`).
- For generate calls, do at most 1 retry with small jitter (200-700ms) to avoid duplicate rapid generation.
- If a stream emits `error`, show a non-blocking UI error and allow manual retry.

## Performance targets observed locally
- Single short generation: roughly 3.6s-4.1s.
- Concurrent generation (10 in parallel): p50 about 4.5s, p95 about 5.0s.
- First stream chunk often near 0.9s-1.1s.

Treat these as current prototype guidance, not SLA.

## Prompt preference hooks
Use these to steer output style by user:
- `biography_instructions` for BIOGRAPHY mode
- `niche_instructions` for NICHE mode

Call `POST /v1/prompt-preferences/set` any time user edits preferences.

## Sample LLM prompt for app implementation
Give this to your coding LLM:

```text
Build a mobile feed client against this backend:
- Base URL: <your_base_url>
- Endpoints: /v1/posts/generate, /v1/posts/generate/stream, /v1/posts/list, /v1/posts/feedback, /v1/posts/feedback/list, /v1/prompt-preferences/set, /v1/prompt-preferences
- Use BIOGRAPHY/TRIVIA/NICHE modes and short/medium lengths.
- Implement:
  1) list existing posts on open,
  2) stream generation for new posts,
  3) keep 4-post prefetch buffer,
  4) send feedback events,
  5) paginate older posts with cursor.
- Respect response envelope {ok,data,error}.
- Add robust network error handling and one-retry policy for generation.
- Keep architecture clean so auth can be added later.
```

## App readiness checklist
- [ ] Uses stable local `user_id`
- [ ] Handles both non-stream and stream generation endpoints
- [ ] Parses SSE `start/chunk/post/done/error` correctly
- [ ] Implements cursor pagination via `nextCursor`
- [ ] Sends feedback for personalization data
- [ ] Supports preference editing for biography/niche instructions
- [ ] Handles `4xx/5xx` errors without crashing
