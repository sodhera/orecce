# Recces Recommendation Engine

## Goal
- Provide a personalized recommendation feed for Recces blog posts.
- Use only per-user signals (no collaborative filtering).

## Current implementation
- `POST /v1/recommendations/recces` is handled by `ReccesRecommendationService`.
- Data source: Supabase `recces_essays` table.
- User profile state: Supabase `user_recommendation_profiles` table.
- New seen-post state: Supabase `user_recommendation_seen_posts` table.

## Scoring signals
- Content similarity: lexical cosine similarity over `theme + slides.text`.
- Session signals: `seed_post_id`, `recent_post_ids`.
- Feedback signals: `upvote/downvote/skip` history.
- Profile signals: per-theme user weights updated by feedback + slide interactions.
- Diversity penalty: discourages repeated themes in a single response.

## Exclusions
A recommendation call excludes:
- Explicit `exclude_post_ids` from request.
- User negatives (`downvote`/`skip`).
- Seed posts used in this request.
- Posts already seen by this user for this author (`user_recommendation_seen_posts`).

This means refresh/subsequent recommendation calls return only never-seen posts until corpus exhaustion.

## Interaction endpoint
`POST /v1/recommendations/recces/interaction`
- Records slide flips/depth.
- Converts interaction depth into a positive theme delta in the user profile.

## Local run
```bash
npm --prefix services/api/functions run dev:supabase
BASE=http://127.0.0.1:8787 ROUNDS=10 LIMIT=8 node services/api/scripts/recces-scroll-sim.mjs
```
