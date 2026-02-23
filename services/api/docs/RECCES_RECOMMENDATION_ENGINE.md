# Recces Recommendation Engine (v1)

## Goal
- Provide a non-collaborative recommendation feed for Recces blog posts.
- Use only:
  - content similarity (`theme + slides.text`)
  - the current user's own signals (`upvote/downvote/skip`)
  - optional in-session seed post IDs.

## Implemented Components
- `functions/src/recces/firestoreReccesRepository.ts`
  - Reads Firestore path: `recces/blogs/{authorId}`.
  - Normalizes each essay document into:
    - `essayId`
    - `sourceTitle`
    - `posts[]` (`theme`, `postType`, `slides[]`).

- `functions/src/services/reccesRecommendationService.ts`
  - Flattens nested posts into stable post IDs:
    - `{authorId}:{essayId}:{postIndex}`
  - Builds token vectors from `theme + slide text`.
  - Pulls recent user feedback from existing `feedback` collection.
  - Scores candidates using:
    - similarity to seed posts / liked posts
    - liked-theme boost
    - small deterministic exploration noise.
  - Applies diversity penalty to reduce repeated themes.

- `functions/src/http/createApp.ts`
  - Adds endpoint: `POST /v1/recommendations/recces`.
  - Validates request with Zod and returns recommendations + metadata.

- `functions/src/index.ts`
  - Wires `FirestoreReccesRepository` + `ReccesRecommendationService` into app dependencies.

## API Contract
### Request
`POST /v1/recommendations/recces`

```json
{
  "author_id": "paul_graham",
  "limit": 12,
  "seed_post_id": "paul_graham:startup:0",
  "recent_post_ids": ["paul_graham:users:1"],
  "exclude_post_ids": ["paul_graham:startup:2"],
  "user_id": "optional-when-auth-disabled"
}
```

### Response
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "paul_graham:startup:1",
        "authorId": "paul_graham",
        "essayId": "startup",
        "sourceTitle": "How to Start a Startup",
        "postIndex": 1,
        "theme": "Understand users",
        "postType": "carousel",
        "slideCount": 5,
        "previewText": "Founders should talk to users...",
        "tags": ["users", "founders", "iterate"],
        "score": 0.81234,
        "reasons": ["similar_to_recent_reads", "matches_liked_theme"]
      }
    ],
    "meta": {
      "authorId": "paul_graham",
      "candidates": 1712,
      "seedsUsed": 3,
      "feedbackSignalsUsed": 27
    }
  }
}
```

## Ranking Summary
- Seed set:
  - request `seed_post_id`
  - request `recent_post_ids`
  - user `upvote` signals from feedback history
- Exclusions:
  - request `exclude_post_ids`
  - `downvote` and `skip` from feedback history
  - seed posts themselves (do not re-recommend same post immediately)
- Score:
  - `0.88 * cosine_similarity_to_best_seed`
  - `+ liked_theme_boost`
  - `+ small deterministic exploration noise`
- Diversity:
  - each additional post from the same theme receives a penalty during selection.

## Notes and Current Limits
- No collaborative filtering is used.
- No embeddings are required in v1; lexical vectors are computed in memory.
- This is designed for prototype scale and can be upgraded to precomputed embeddings later.
- Existing `feedback` collection is reused as interaction signal store.

## Suggested Next Steps
1. Add a dedicated interaction event model (`view`, `dwell_ms`, `hide`) for better ranking quality.
2. Add precomputed embeddings and ANN retrieval for larger corpora.
3. Add scheduled feed precomputation if API latency becomes an issue.

## Session Simulation
- Script: `services/api/scripts/recces-scroll-sim.mjs`
- Simulates:
  - recommendation fetch
  - open/select top item
  - optional feedback submit
  - next recommendation request with session context (`recent_post_ids`, `exclude_post_ids`)
- Local run:
```bash
npm --prefix services/api/functions run dev:server
BASE=http://127.0.0.1:8787 ROUNDS=10 LIMIT=8 node services/api/scripts/recces-scroll-sim.mjs
```
- Cloud run:
```bash
BASE=https://<region>-<project>.cloudfunctions.net/api AUTH_TOKEN="<firebase_id_token>" node services/api/scripts/recces-scroll-sim.mjs
```
