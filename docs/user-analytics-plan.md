# Orecce User Analytics Plan

## Goal
Build a single user-behavior analytics system across mobile, web, and API so Orecce can answer:

- How users enter, activate, retain, and return.
- Which content, authors, topics, and recommendation paths drive engagement.
- Which actions actually improve feed quality and personalization.
- Where users drop off in onboarding, auth, discovery, saves, collections, curation, and feedback.

This plan is broader than the recommendation feedback layer. `upvote`, `downvote`, `save`, and `unsave` are useful personalization signals, but the analytics system also needs sessions, impressions, opens, funnels, and derived facts.

## Implementation status

Implemented on 2026-03-01:

- Shared event envelope in `packages/api-core/src/analytics/types.ts`
- Shared validation schema in `packages/api-core/src/validation/requestValidation.ts`
- Analytics batch ingestion at `POST /v1/analytics/events/batch` in both the core API app and the Next.js app route
- Append-only `analytics_events_raw` storage plus derived SQL views in the base schema and a forward migration
- Batched client analytics wrappers in `apps/web/src/lib/analytics.ts` and `apps/mobile/src/services/analytics.ts`
- Broad instrumentation across auth, feed, discover, saves, collections, notifications, curation, and feedback flows
- Living documentation in [`docs/user-analytics-ops.md`](./user-analytics-ops.md) plus agent instructions in `AGENTS.md`

## Current state audit

| Surface | What exists now | Main gaps |
| --- | --- | --- |
| Mobile (`apps/mobile`) | Shared batching client, anonymous/device/session IDs, route tracking, auth events, onboarding/preferences events, feed impressions/seen/open/read, vote/save/share, post-detail source/chat events, collection and saved events. | Some screens still fall back to generic `screen_viewed`. Feed data is still partly mock, so analytics quality depends on real content rollout. |
| Web (`apps/web`) | Shared batching client, anonymous/device/session IDs, page views, auth lifecycle events, feed impressions/seen/load-more, votes/saves/read, discover author impressions, collection events, notifications, feedback, curation, and post-detail analytics. | Some secondary UI flows still emit generic `page_viewed` or route-only context. No server-side dashboards yet. |
| API (`services/api` + `packages/api-core`) | Shared event contract, request validation, optional-auth batch ingestion, repository persistence, raw event storage, and derived views for sessions, daily user facts, daily content facts, funnels, and recommendation outcomes. | No dedicated reporting jobs, alerting, or analytics-specific endpoint tests yet. |
| Data model | Analytics storage now lives in the core migration path with a forward migration for provisioned environments. | Canonical `user_id` is still split across existing product tables in some areas, and anonymous-to-auth identity aliasing is still client-side only. |

## Remaining blind spots

1. Anonymous-to-auth identity merge is not yet modeled as a durable server-side alias table.
2. Mobile still contains mock content paths, so some event properties will stay synthetic until the live feed path is fully wired.
3. Some secondary routes only emit `page_viewed` or `screen_viewed` and could be upgraded to more specific intent events.
4. There are no analytics dashboards, freshness checks, or anomaly alerts yet.
5. The new analytics path has validation coverage, but not dedicated end-to-end analytics ingestion tests.

## Target architecture

### 1. One event contract
Implemented.

The shared event envelope now covers:

- `event_id`
- `event_name`
- `platform` (`mobile`, `web`, `api`)
- `surface`
- `occurred_at_ms`
- `session_id`
- `anonymous_id`
- `user_id` via top-level auth context and/or properties
- `device_id`
- `app_version`
- `route_name`
- `request_id`
- `properties` (`jsonb`)

Recommended content properties:

- `post_id`
- `author_id`
- `recce_id`
- `recce_type`
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
  "platform": "web",
  "surface": "feed",
  "occurred_at_ms": 1772355600000,
  "session_id": "session:01",
  "anonymous_id": "anon:01",
  "device_id": "device:01",
  "app_version": "web@0.1.0",
  "route_name": "/feed",
  "request_id": "req_01",
  "properties": {
    "user_id": "auth_uid",
    "post_id": "post_123",
    "author_id": "author_456",
    "feed_position": 3,
    "visible_ratio": 0.84,
    "match_reason": "Following Author"
  }
}
```

### 2. One ingestion path
Implemented.

Active ingestion path:

- Core API: `packages/api-core/src/http/createApp.ts`
- Web app route mirror: `apps/web/src/app/api/v1/analytics/events/batch/route.ts`

Current rules:

- Clients batch and retry.
- Auth is optional; bearer context is attached when present.
- Events are append-only.
- Product-state tables such as feedback, saves, follows, and recommendation state remain operational state, not the analytics source of truth.

### 3. One warehouse layer
Implemented as a schema foundation.

Current analytics storage:

- `analytics_events_raw`
- `analytics_sessions`
- `analytics_daily_user_facts`
- `analytics_daily_content_facts`
- `analytics_funnel_facts`
- `analytics_recommendation_outcomes`

These views are now present in both the base schema and the forward migration so fresh setups and provisioned databases converge.

### 4. Identity and session normalization
Partially implemented.

Current decisions:

- Supabase auth UID should remain the canonical `user_id`.
- `app_users` should stay profile state, not a second identity source.
- `anonymous_id`, `device_id`, and `session_id` now exist on both web and mobile clients.
- Anonymous-to-auth aliasing still needs a durable backend model if long-term attribution across auth boundaries becomes a requirement.

## Event taxonomy

### Acquisition and auth

- `landing_viewed`
- `page_viewed`
- `screen_viewed`
- `auth_modal_opened`
- `signup_entry_selected`
- `login_entry_selected`
- `signup_started`
- `signup_completed`
- `signup_failed`
- `login_started`
- `login_completed`
- `login_failed`
- `oauth_started`
- `oauth_completed`
- `password_reset_requested`
- `verification_email_opened`
- `verification_deferred`

Key properties:

- `method`
- `provider`
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

- `post_detail_viewed`
- `post_upvoted`
- `post_downvoted`
- `post_vote_cleared`
- `post_saved`
- `post_unsaved`
- `post_shared`
- `post_source_opened`
- `sources_expanded`
- `sources_collapsed`
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
- `discover_recce_impression`
- `recce_followed`
- `recce_unfollowed`
- `search_started`
- `search_submitted`
- `search_result_opened`
- `search_zero_results`

Key properties:

- `recce_id`
- `recce_key`
- `recce_name`
- `recce_type`
- `query_length`
- `query_category`
- `result_count`

### Saved, liked, and collections

- `liked_viewed`
- `saved_viewed`
- `collection_create_started`
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
- `curation_session_list_viewed`
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

Status: complete

- Defined the shared event contract in code and docs.
- Added client batching wrappers on web and mobile.
- Added the analytics event table, derived views, and forward migration.
- Added `POST /v1/analytics/events/batch`.

### Phase 1: Instrument the main behavior loop

Status: mostly complete

- Feed impressions, seen, opens, reads, slide interactions, votes, saves, shares, and source opens are instrumented.
- Auth success/failure is instrumented.
- Discover Recce impressions and author/topic follows are instrumented, and the web Discover surface now exposes those Recces through a category dropdown.
- Saved and collection actions are instrumented.

### Phase 2: Instrument secondary journeys

Status: partially complete

- Interests, notifications, feedback, and curation are instrumented.
- Search is instrumented on mobile explore.
- Some onboarding and secondary route flows still rely on generic route-level events.

### Phase 3: Derived analytics and reporting

Status: schema foundation complete

- Daily user/content facts, funnel facts, and recommendation outcome views exist.
- Dashboards, recurring reports, and quality monitoring still need to be built on top.

### Phase 4: Quality controls

Status: pending

- Add analytics-specific endpoint tests.
- Add volume anomaly alerts.
- Add dashboard freshness checks.
- Add duplicate-event and missing-session audits.

## Immediate implementation checklist

1. [x] Add shared tracking wrappers in `apps/mobile` and `apps/web`.
2. [x] Add `POST /v1/analytics/events/batch` in the API.
3. [x] Create append-only analytics tables plus forward migrations.
4. [x] Wire web feed impressions and slide interactions into the new event stream.
5. [x] Wire mobile auth, home feed, post detail, and preference flows.
6. [x] Start updating the living operations file in [`docs/user-analytics-ops.md`](./user-analytics-ops.md).
7. [ ] Add dashboards, alerts, and analytics-specific integration tests.

## Baseline assessment on 2026-03-01

- Mobile analytics coverage: medium
- Web analytics coverage: medium to high
- API analytics coverage: medium to high
- Overall confidence in behavior measurement: medium

The repo now has a real end-to-end analytics foundation. The next step is not more basic instrumentation; it is tightening identity fidelity, building reporting, and adding quality controls so the captured data stays trustworthy.
