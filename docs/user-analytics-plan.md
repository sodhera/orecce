# Orecce User Analytics Plan

## Goal
Build a single user-behavior analytics system across mobile, web, and API so Orecce can answer:

- How users enter, activate, retain, and return.
- Which content, authors, topics, and recommendation paths drive engagement.
- Which actions actually improve feed quality and personalization.
- Where users drop off in onboarding, auth, discovery, saves, collections, curation, and feedback.

This plan is intentionally broader than the current recommendation feedback layer. `upvote`, `downvote`, `save`, and `slide_flip_count` are useful personalization signals, but they are not a full analytics system.

## Current state audit

| Surface | What exists now | Main gaps |
| --- | --- | --- |
| Mobile (`apps/mobile`) | Auth, onboarding, home feed, explore, saved, inbox, profile, post details. Feedback persists through `/v1/posts/feedback`. | No common analytics client. Most screens are not instrumented. Feed is still mostly mock data. Search, share, onboarding, collections, and post-detail chat are not measured. |
| Web (`apps/web`) | Landing/auth, discover, feed, liked, saved, collections, notifications, feedback, curation sidebar. Likes, saves, read state, follows, feedback, and collections write directly to Supabase. `markAsSeen` uses local storage. | No raw event stream. No unified session tracking. Recommendation interaction endpoint exists but is not wired into the main feed flow. Seen/impression/dwell data is incomplete. |
| API (`services/api` + `packages/api-core`) | Feedback table, recommendation profile table, seen-post state, curate chat sessions, recommendation interaction endpoint. | No general analytics ingestion endpoint, no warehouse-style event table, no derived marts, no funnel/reporting layer. |
| Data model | Specialized product tables exist for feedback and recommendation state. | User IDs and schema ownership are split. Core SQL uses `text` IDs in `app_users`-style tables, while web SQL scripts use `uuid` references to `auth.users`. That needs to be normalized before analytics becomes trustworthy. |

## High-priority blind spots

1. There is no canonical event stream for user behavior.
2. Mobile and web do not share one event taxonomy.
3. Impression, dwell, scroll depth, and content-open signals are either missing or only local.
4. Search, onboarding, notifications, settings, and feedback flows are largely invisible.
5. Some important feed tables and RPCs live in `apps/web/*.sql` instead of the core migration path, which makes cross-surface analytics drift likely.
6. The system stores recommendation outcomes, but not enough context to explain why users converted, bounced, or churned.

## Target architecture

### 1. One event contract
Introduce one shared event envelope for both clients and the API.

Required fields:

- `event_id`
- `event_name`
- `occurred_at`
- `platform` (`mobile`, `web`, `api`)
- `surface` (`landing`, `auth`, `feed`, `discover`, `saved`, `collections`, `post_detail`, `notifications`, `settings`, `curation`, `feedback`)
- `session_id`
- `anonymous_id`
- `user_id`
- `device_id`
- `app_version`
- `route_name`
- `request_id`
- `properties` (`jsonb`)

Recommended properties for content events:

- `post_id`
- `author_id`
- `collection_id`
- `topic`
- `match_reason`
- `post_type`
- `slide_count`
- `current_slide_index`
- `feed_position`
- `source_surface`
- `source_url`
- `dwell_ms`
- `visible_ratio`

Example:

```json
{
  "event_id": "evt_01",
  "event_name": "feed_post_impression",
  "occurred_at": "2026-03-01T09:00:00.000Z",
  "platform": "web",
  "surface": "feed",
  "session_id": "sess_01",
  "anonymous_id": "anon_01",
  "user_id": "auth_uid",
  "device_id": "device_01",
  "app_version": "web@0.1.0",
  "route_name": "/feed",
  "request_id": "req_01",
  "properties": {
    "post_id": "post_123",
    "author_id": "author_456",
    "feed_position": 3,
    "visible_ratio": 0.84,
    "match_reason": "Following Author"
  }
}
```

### 2. One ingestion path
Add a backend endpoint such as `POST /v1/analytics/events/batch`.

Rules:

- Clients batch and retry.
- API adds server timestamps and auth context.
- Events are append-only.
- Specialized tables like `feedback`, `user_history`, and recommendation profiles remain product state, not the analytics source of truth.

### 3. One warehouse layer
Add these tables or equivalents:

- `analytics_events_raw`
- `analytics_sessions`
- `analytics_daily_user_facts`
- `analytics_daily_content_facts`
- `analytics_funnel_facts`
- `analytics_recommendation_outcomes`

Derived models should answer:

- activation by platform
- onboarding completion rate
- signup to first-feed-view time
- impression to open rate
- open to like/save/share rate
- follow to first-return rate
- curation usage to retention lift
- feedback submission rate
- recommendation quality by author, topic, and match reason

### 4. Identity and session normalization
Normalize IDs before broad rollout.

Required decisions:

- Use Supabase auth UID as canonical `user_id`.
- Keep `app_users` as profile state only, not a second user identity.
- Generate `anonymous_id` before auth and alias it to `user_id` after signup/login.
- Use one session definition across web and mobile.

## Event taxonomy

### Acquisition and auth

- `landing_viewed`
- `auth_modal_opened`
- `signup_started`
- `signup_completed`
- `signup_failed`
- `login_started`
- `login_completed`
- `login_failed`
- `oauth_started`
- `oauth_completed`
- `password_reset_requested`

Key properties:

- `method`
- `error_code`
- `from_surface`
- `time_to_complete_ms`

### Onboarding and preferences

- `onboarding_started`
- `onboarding_slide_viewed`
- `onboarding_skipped`
- `onboarding_completed`
- `interest_added`
- `interest_removed`
- `preferences_saved`

Key properties:

- `slide_id`
- `slide_index`
- `interest_count`
- `pref_source`

### Feed and recommendation loop

- `feed_viewed`
- `feed_refreshed`
- `feed_load_more_requested`
- `feed_empty_state_viewed`
- `feed_post_impression`
- `feed_post_seen`
- `feed_post_opened`
- `feed_post_read`
- `feed_post_hidden`
- `feed_post_skipped`
- `recommendation_batch_served`
- `recommendation_interaction_recorded`

Key properties:

- `post_id`
- `author_id`
- `feed_position`
- `match_reason`
- `recommendation_rank`
- `dwell_ms`
- `visible_ratio`
- `served_count`

### Post interaction

- `post_upvoted`
- `post_downvoted`
- `post_vote_cleared`
- `post_saved`
- `post_unsaved`
- `post_shared`
- `post_source_opened`
- `post_double_tap_liked`
- `post_expand_opened`
- `post_expand_closed`
- `carousel_slide_advanced`
- `carousel_completed`

Key properties:

- `post_id`
- `author_id`
- `topic`
- `slide_index`
- `slide_count`
- `source_domain`

### Discover, follows, and search

- `discover_viewed`
- `discover_author_impression`
- `author_followed`
- `author_unfollowed`
- `search_started`
- `search_submitted`
- `search_result_opened`
- `search_zero_results`

Key properties:

- `author_id`
- `query_length`
- `query_category`
- `result_count`

### Saved, liked, and collections

- `liked_viewed`
- `saved_viewed`
- `collection_created`
- `collection_renamed`
- `collection_deleted`
- `collection_opened`
- `post_saved_to_collection`
- `post_removed_from_collection`

Key properties:

- `collection_id`
- `collection_name`
- `post_count`

### Notifications and inbox

- `notifications_viewed`
- `notification_opened`
- `notification_marked_read`
- `notifications_cleared`
- `notification_preferences_updated`

Key properties:

- `notification_type`
- `delivery_channel`

### Curation and feedback

- `curation_panel_opened`
- `curation_prompt_clicked`
- `curation_message_sent`
- `curation_reply_received`
- `curation_session_resumed`
- `curation_session_deleted`
- `feedback_viewed`
- `feedback_submitted`
- `feedback_submit_failed`

Key properties:

- `message_count`
- `reply_latency_ms`
- `feedback_category`

### Profile, settings, and lifecycle

- `profile_viewed`
- `profile_updated`
- `password_updated`
- `theme_changed`
- `notification_channel_changed`
- `logout_completed`
- `app_opened`
- `app_backgrounded`
- `app_closed`

## Implementation phases

### Phase 0: Normalize the foundation

- Define the event taxonomy in code and docs.
- Normalize `user_id`, `anonymous_id`, and `session_id`.
- Move web-only SQL objects needed for feed analytics into the core migration path.
- Create the analytics event tables and ingestion endpoint.

### Phase 1: Instrument the main behavior loop

- Feed impressions, opens, dwell, slide flips, likes, downvotes, saves, shares, source opens.
- Auth success/failure.
- Discover follows/unfollows.
- Saved and collection actions.

This phase gives the fastest value.

### Phase 2: Instrument secondary journeys

- Onboarding and interests.
- Search.
- Notifications.
- Profile and settings.
- Feedback page.
- Mobile post detail assistant/chat behavior.

### Phase 3: Derived analytics and reporting

- Build daily user/content facts.
- Add retention and funnel reporting.
- Add recommendation outcome reporting by author/topic/match reason.
- Segment by platform, acquisition method, and user maturity.

### Phase 4: Quality controls

- Event schema validation tests.
- Event volume anomaly alerts.
- Dashboard freshness checks.
- Duplicate-event and missing-session audits.

## Immediate implementation checklist

1. Add shared tracking wrappers in `apps/mobile` and `apps/web`.
2. Add `POST /v1/analytics/events/batch` in the API.
3. Create append-only analytics tables plus forward migrations.
4. Wire web feed impressions and slide interactions into the new event stream.
5. Wire mobile onboarding, home feed, post detail, and auth flows.
6. Start updating the living operations file in [`docs/user-analytics-ops.md`](./user-analytics-ops.md).

## Baseline assessment on 2026-03-01

- Mobile analytics coverage: low
- Web analytics coverage: low to medium
- API analytics coverage: medium for personalization, low for product analytics
- Overall confidence in behavior measurement: low

The repo has enough building blocks to start quickly, but not enough consistency to claim full user analytics yet.
