# API Contract (v0)

Base path: `/v1`

Modes:
- `BIOGRAPHY`
- `TRIVIA`
- `NICHE`

Lengths:
- `short` (target 50-110 words)
- `medium` (target 120-220 words)

Feedback types:
- `upvote`
- `downvote`
- `skip`

## Health
`GET /health`

Response:
```json
{
  "ok": true
}
```

## Generate post (non-stream)
`POST /posts/generate`

Body:
```json
{
  "user_id": "u1",
  "mode": "BIOGRAPHY",
  "profile": "Steve Jobs",
  "length": "short"
}
```

Success response:
```json
{
  "ok": true,
  "data": {
    "id": "post_123",
    "userId": "u1",
    "mode": "BIOGRAPHY",
    "profile": "Steve Jobs",
    "profileKey": "steve jobs",
    "length": "short",
    "title": "He Bet the Company on One Launch",
    "body": "....",
    "post_type": "biography",
    "tags": ["Steve Jobs", "Apple", "turning point"],
    "confidence": "medium",
    "uncertainty_note": null,
    "createdAtMs": 1739220000000
  }
}
```

## Generate post (streaming SSE)
`POST /posts/generate/stream`

Headers:
- `Content-Type: application/json`
- `Accept: text/event-stream`

Request body is the same as `/posts/generate`.

SSE events:
- `start` -> request echo (`user_id`, `mode`, `profile`, `length`)
- `chunk` -> incremental text (`{ "delta": "..." }`)
- `post` -> final saved post payload (`{ "ok": true, "data": { ... } }`)
- `done` -> completion marker (`{ "ok": true }`)
- `error` -> structured error payload (`{ "ok": false, "error": { ... } }`)

## List posts (paginated)
`POST /posts/list`

Body:
```json
{
  "user_id": "u1",
  "mode": "BIOGRAPHY",
  "profile": "Steve Jobs",
  "page_size": 10,
  "cursor": "1739220000000"
}
```

Success response:
```json
{
  "ok": true,
  "data": {
    "items": [],
    "nextCursor": "1739219900000"
  }
}
```

`nextCursor` is `null` when there are no more pages.

## Save feedback
`POST /posts/feedback`

Body:
```json
{
  "user_id": "u1",
  "post_id": "post_123",
  "feedback_type": "upvote"
}
```

Success response:
```json
{
  "ok": true,
  "data": {
    "id": "fb_123",
    "userId": "u1",
    "postId": "post_123",
    "type": "upvote",
    "createdAtMs": 1739220000000
  }
}
```

## List feedback (paginated)
`POST /posts/feedback/list`

Body:
```json
{
  "user_id": "u1",
  "post_id": "optional-post-id",
  "page_size": 20,
  "cursor": "1739220000000"
}
```

Success response:
```json
{
  "ok": true,
  "data": {
    "items": [],
    "nextCursor": null
  }
}
```

## Set prompt preferences
`POST /prompt-preferences/set`

Body:
```json
{
  "user_id": "u1",
  "biography_instructions": "Focus on founders and documented events.",
  "niche_instructions": "2000s nostalgia with internet culture references."
}
```

Success response:
```json
{
  "ok": true,
  "data": {
    "biographyInstructions": "Focus on founders and documented events.",
    "nicheInstructions": "2000s nostalgia with internet culture references.",
    "updatedAtMs": 1739220000000
  }
}
```

## Get prompt preferences
`GET /prompt-preferences?user_id=u1`

Success response:
```json
{
  "ok": true,
  "data": {
    "biographyInstructions": "",
    "nicheInstructions": "",
    "updatedAtMs": 1739220000000
  }
}
```

## Error shape
All error responses use this envelope:
```json
{
  "ok": false,
  "error": {
    "code": "bad_request",
    "message": "Invalid generate request.",
    "details": null
  }
}
```

Typical status codes:
- `400` bad request payload
- `500` internal server error
- `502` LLM upstream/payload issues
