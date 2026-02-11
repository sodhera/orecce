# API Contract (Firebase Auth + Prefilled Posts)

Base path: `/v1`

All `/v1/*` and `/users/*` endpoints require:
- `Authorization: Bearer <firebase-id-token>`

`/health` is public.

## Health
`GET /health`

Response:
```json
{ "ok": true }
```

## User profile
`GET /v1/users/me`
- Creates user doc lazily if missing.
- Ensures shared common prefilled dataset is copied once for this user.
- Auth-trigger (`onAuthUserCreate`) also attempts this copy at signup time.

`PATCH /v1/users/me`
```json
{
  "profile": {
    "displayName": "Sirish",
    "photoURL": "https://example.com/me.jpg"
  }
}
```

`POST /v1/users/me/prefills/regenerate`
```json
{
  "posts_per_mode": 8
}
```

Compatibility routes for current mobile client:
- `GET /users/:userId`
- `PATCH /users/:userId`

These require `:userId === auth.uid`.

## Prompt preferences
`POST /v1/prompt-preferences/set`
```json
{
  "biography_instructions": "Focus on public events.",
  "niche_instructions": "Concise, internet-native style."
}
```

`GET /v1/prompt-preferences`

## Posts (prefilled, not generated live)
Modes:
- `BIOGRAPHY`
- `TRIVIA`
- `NICHE`

Lengths:
- `short`
- `medium`

`POST /v1/posts/list`
```json
{
  "mode": "BIOGRAPHY",
  "profile": "Steve Jobs",
  "page_size": 10,
  "cursor": "10"
}
```

- Returns pre-generated posts from Firestore user prefill documents.
- Those user documents are cloned from a shared common dataset once per user.
- If exact `profile` is missing, backend falls back to mode default generic profile.

`POST /v1/posts/generate`
```json
{
  "mode": "BIOGRAPHY",
  "profile": "Steve Jobs",
  "length": "short"
}
```

- Returns next prefilled post (pointer-based), no live LLM call.

`POST /v1/posts/generate/stream`
- Same request body as above.
- Emits SSE events:
  - `start`
  - `chunk` (chunked stored post text)
  - `post`
  - `done`
  - `error`

## Feedback
`POST /v1/posts/feedback`
```json
{
  "post_id": "prefill-biography-1",
  "feedback_type": "upvote"
}
```

`POST /v1/posts/feedback/list`
```json
{
  "page_size": 20,
  "cursor": "1739220000000"
}
```

Feedback types:
- `upvote`
- `downvote`
- `skip`

## Error shape
```json
{
  "ok": false,
  "error": {
    "code": "bad_request",
    "message": "Invalid payload.",
    "details": null
  }
}
```
