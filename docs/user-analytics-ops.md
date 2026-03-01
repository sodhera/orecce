# Orecce User Analytics Operations Log

This is the living analytics file. It is meant to be updated on a schedule and after analytics-related product changes.

## Automation contract

When updating this file:

1. Review [`docs/user-analytics-plan.md`](./user-analytics-plan.md).
2. Scan `apps/mobile`, `apps/web`, `services/api`, and `packages/api-core` for new or changed user-facing flows.
3. Record which events are implemented, missing, broken, or inconsistent.
4. Update the coverage table, open gaps, and next actions.
5. Keep the section headings stable so this file stays machine-updatable.

## Last review

- Reviewed on: 2026-03-01
- Reviewer: Codex
- Scope: repo-wide audit for mobile, web, API, docs, and schema ownership

## Coverage snapshot

| Area | Coverage | Notes |
| --- | --- | --- |
| Identity and sessions | Red | No shared anonymous/session analytics identity across mobile and web. |
| Mobile auth and onboarding | Red | Flows exist, but no analytics instrumentation. |
| Mobile feed and post details | Red | Feedback persists, but impressions, dwell, opens, share, chat, and source usage are not tracked as analytics events. |
| Web landing and auth | Red | No raw event stream for view, signup, login, or password reset funnels. |
| Web feed and recommendations | Yellow | Likes, saves, follows, and read state exist as product writes, but not as unified analytics events. Seen state is partly local-only. |
| Web discover/search | Red | Follow state exists, but discover/search analytics are largely absent. |
| Web collections | Yellow | Collections exist, but collection behavior is not tracked as analytics events. |
| Web notifications | Red | Notifications page exists, but behavior is not instrumented and appears mostly placeholder. |
| Curation and feedback | Yellow | Curate chat sessions and feedback submission exist, but operational analytics are missing. |
| API analytics ingestion | Red | No append-only analytics endpoint or raw event table. |
| Derived reporting | Red | No warehouse-style marts, funnels, retention facts, or content outcome reporting. |

## Current blockers

1. There is no canonical `analytics_events` table or ingestion endpoint.
2. Event naming is not unified across mobile, web, and API.
3. Core API schema ownership and web SQL ownership are split.
4. The recommendation interaction endpoint exists, but the main web feed does not appear to use it.
5. Mobile still relies heavily on mock feed and collection data, so event completeness there will lag until the product data path is real.

## Current instrumentation inventory

### Product-state signals that already exist

- `feedback` table for `upvote`, `downvote`, `skip`, `save`, `unsave`
- `user_recommendation_profiles`
- `user_recommendation_seen_posts`
- `curate_chat_sessions`
- web `user_likes`
- web `user_saves`
- web `user_history`
- web `user_author_follows`
- web `save_collections`
- `user_feedback`

### Missing analytics signals

- session start/end
- anonymous to authenticated identity merge
- landing page views
- onboarding funnel
- auth funnel timing
- feed impressions
- dwell time
- discover impressions
- search usage
- notification usage
- share outcomes
- source-open outcomes
- collection funnel analytics
- settings/profile analytics
- error-rate and latency analytics by user journey

## Gaps to fix first

### P0

- Add a raw event stream and batch ingestion API.
- Normalize identity and session fields.
- Instrument `feed_post_impression`, `feed_post_opened`, `feed_post_read`, `post_saved`, `post_upvoted`, `post_downvoted`, `post_shared`, `post_source_opened`.
- Instrument `signup_completed`, `login_completed`, `author_followed`, `collection_created`, and `feedback_submitted`.

### P1

- Instrument onboarding, interests, search, settings, and notifications.
- Record dwell and carousel completion consistently across mobile and web.
- Add recommendation outcome facts by author, topic, and match reason.

### P2

- Add latency/error analytics around curation chat and recommendation endpoints.
- Add experiment assignment fields for future ranking tests.

## Questions this system should answer once implemented

1. What percentage of new users reach first meaningful feed interaction within the first session?
2. Which authors, topics, and match reasons drive the highest save rate and return rate?
3. Do feed impressions with deeper carousel completion predict follow or save behavior?
4. Which onboarding steps correlate with higher 7-day retention?
5. Does curate chat usage improve subsequent recommendation quality or session length?
6. Which sources and post types generate opens but not saves, and which generate both?

## Next actions

1. Create the analytics ingestion endpoint and raw event tables.
2. Add shared client tracking wrappers and use one taxonomy from the plan doc.
3. Move analytics-relevant web SQL objects into forward migrations under `packages/api-core/src/db/migrations/`.
4. Wire the web feed to emit impression, open, read, slide, and source-open events.
5. Wire the mobile feed, onboarding, and post details screens to the same event names.

## Change log

### 2026-03-01

- Created the initial repo-wide analytics plan.
- Established this operations log as the structured file for recurring updates.
- Recorded the current baseline as mostly red/yellow coverage with no canonical analytics event stream.
