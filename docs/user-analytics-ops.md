# Orecce User Analytics Operations Log

This is the living analytics file. It is meant to be updated on a schedule and after analytics-related product changes.

## Automation contract

When updating this file:

1. Review [`docs/user-analytics-plan.md`](./user-analytics-plan.md).
2. Scan `apps/mobile`, `apps/web`, `services/api`, and `packages/api-core` for new or changed user-facing flows.
3. Record which events are implemented, missing, broken, or inconsistent.
4. Update the coverage table, open gaps, and next actions.
5. Keep the section headings stable so this file stays machine-updatable.
6. Keep the recurring audit automation in `/Users/sirishjoshi/.codex/automations/analytics-audit/automation.toml` aligned if the review workflow changes.

## Last review

- Reviewed on: 2026-03-01
- Reviewer: Codex
- Scope: repo-wide implementation pass across mobile, web, API, docs, schema, and automation

## Coverage snapshot

| Area | Coverage | Notes |
| --- | --- | --- |
| Identity and sessions | Yellow | Web and mobile now emit anonymous/device/session IDs, but anonymous-to-auth aliasing is still client-side only. |
| Mobile auth and onboarding | Yellow | Auth, welcome-entry, verification, route tracking, and preferences are instrumented; some onboarding steps still rely on generic route-level events. |
| Mobile feed and post details | Green | Feed view/impression/seen/open/read plus vote/save/share/source/chat events are instrumented and batched to the analytics endpoint. |
| Web landing and auth | Green | Landing, auth modal, signup/login/password reset, OAuth, logout, and page/session lifecycle are instrumented. |
| Web feed and recommendations | Green | Feed views, impressions, seen, load more, votes, saves, reads, shares, source opens, and carousel events are instrumented. |
| Web discover/search | Green | Discover views plus generic Recce impressions and follow/unfollow events now cover both author and topic Recces; search-specific analytics are still sparse on web. |
| Web collections | Green | Collection create/open/rename/delete flows are instrumented. |
| Web notifications | Yellow | View/open/mark-read/clear events are instrumented, but the product surface is still fairly thin. |
| Curation and feedback | Green | Curation panel, prompts, send/reply, session lifecycle, and feedback submission outcomes are instrumented. |
| API analytics ingestion | Green | Shared validation, optional-auth ingestion, repository persistence, raw event storage, and forward migrations are in place. |
| Derived reporting | Yellow | Session, daily user/content, funnel, and recommendation-outcome views exist, but dashboards and quality monitors do not yet. |

## Current blockers

1. Anonymous-to-auth identity stitching is not durable on the backend yet.
2. Mobile still relies partly on mock feed data, which limits data quality for some feed metrics.
3. Some secondary surfaces still emit generic `page_viewed` or `screen_viewed` instead of more intent-specific events.
4. There are no analytics dashboards, freshness checks, or anomaly alerts yet.
5. The analytics pipeline does not yet have dedicated integration tests that exercise end-to-end ingestion.

## Current instrumentation inventory

### Analytics pipeline now in place

- shared event envelope in `packages/api-core/src/analytics/types.ts`
- shared request validation for analytics batches
- `POST /v1/analytics/events/batch` in the core API app
- mirrored `POST /api/v1/analytics/events/batch` route in the web app
- append-only `analytics_events_raw` table
- derived views for sessions, daily user facts, daily content facts, funnels, and recommendation outcomes
- web batching client with lifecycle flush support
- mobile batching client with AsyncStorage-backed identity/session state

### Product-state signals that still exist alongside analytics

- `feedback` table for `upvote`, `downvote`, `skip`, `save`, `unsave`
- `user_recommendation_profiles`
- `user_recommendation_seen_posts`
- `curate_chat_sessions`
- web `user_likes`
- web `user_saves`
- web `user_history`
- web `user_author_follows`
- web `user_topic_follows`
- web `save_collections`
- `user_feedback`

### Implemented surface coverage

- web landing/auth: `landing_viewed`, `auth_modal_opened`, signup/login/OAuth/password reset/logout lifecycle events
- web feed: `feed_viewed`, `feed_load_more_requested`, `feed_post_impression`, `feed_post_seen`, `feed_post_read`, votes, saves, shares, source opens, carousel events
- web discover: `discover_viewed`, `discover_recce_impression`, `recce_followed`, `recce_unfollowed` across a category-filtered Recce browser
- web collections/saved: `saved_viewed`, `collection_create_started`, `collection_created`, `collection_renamed`, `collection_deleted`, `collection_opened`
- web notifications: `notifications_viewed`, `notification_opened`, `notification_marked_read`, `notifications_cleared`
- web curation/feedback: panel, prompt, send/reply, session lifecycle, feedback submitted/failed
- mobile lifecycle/auth: `app_opened`, `app_backgrounded`, route views, signup/login/OAuth/password reset/logout, welcome entry selection, verification actions
- mobile preferences/feed: `interest_added`, `interest_removed`, `preferences_saved`, `feed_viewed`, `feed_refreshed`, impressions, seen, opens, reads, votes, saves, shares
- mobile post detail: `post_detail_viewed`, `post_source_opened`, `sources_expanded`, `sources_collapsed`, curation send/reply

### Missing or weak analytics signals

- durable anonymous-to-auth identity merge
- explicit onboarding-step events across every mobile signup screen
- richer web search analytics
- settings/profile mutation analytics
- latency/error analytics by journey
- dashboards, alerts, and freshness monitoring

## Gaps to fix first

### P0

- Done.
- Raw event stream and batch ingestion API exist.
- Identity and session fields exist on both clients.
- High-value feed/auth/collection/feedback instrumentation is live.

### P1

- Add durable identity stitching between anonymous and authenticated usage.
- Instrument remaining onboarding and settings/profile surfaces with intent-specific events.
- Expand web search analytics.
- Start consuming derived views in reporting queries or dashboards.

### P2

- Add latency/error analytics around curation chat and recommendation endpoints.
- Add experiment assignment fields for future ranking tests.
- Add anomaly detection, freshness checks, and dedupe audits.

## Questions this system should answer once implemented

1. What percentage of new users reach first meaningful feed interaction within the first session?
2. Which authors, topics, and match reasons drive the highest save rate and return rate?
3. Do feed impressions with deeper carousel completion predict follow or save behavior?
4. Which onboarding steps correlate with higher 7-day retention?
5. Does curate chat usage improve subsequent recommendation quality or session length?
6. Which sources and post types generate opens but not saves, and which generate both?

## Next actions

1. Add analytics-specific integration tests for batch ingestion and repository persistence.
2. Add durable anonymous-to-auth identity stitching if cross-auth attribution becomes a product requirement.
3. Upgrade remaining generic route events to specific onboarding, settings, and search events.
4. Build first-pass dashboards or SQL notebooks from `analytics_daily_user_facts`, `analytics_daily_content_facts`, and `analytics_funnel_facts`.
5. Add recurring quality checks for event volume, freshness, and duplicate sessions.

## Change log

### 2026-03-01

- Created the initial repo-wide analytics plan.
- Established this operations log as the structured file for recurring updates.
- Added the shared analytics event contract, batching clients, ingestion endpoint, raw storage, and derived views.
- Instrumented major mobile and web user-behavior flows with a shared taxonomy.
- Created and aligned the recurring analytics audit automation.
- Expanded web Recce analytics from author-only events to generic author/topic Recce discovery and follow events.
- Grouped Discover Recces into category buckets with a dropdown filter while keeping the same discover/follow analytics events.
