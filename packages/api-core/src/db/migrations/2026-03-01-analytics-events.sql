-- Add raw analytics storage and derived reporting views.

create table if not exists public.analytics_events_raw (
  event_id text primary key,
  event_name text not null,
  platform text not null,
  surface text,
  user_id text,
  anonymous_id text,
  session_id text,
  device_id text,
  app_version text,
  route_name text,
  request_id text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

alter table if exists public.analytics_events_raw
  drop constraint if exists analytics_events_raw_platform_check;

alter table if exists public.analytics_events_raw
  add constraint analytics_events_raw_platform_check
  check (platform in ('web','mobile','api'));

create index if not exists idx_analytics_events_occurred
  on public.analytics_events_raw (occurred_at desc);
create index if not exists idx_analytics_events_user_occurred
  on public.analytics_events_raw (user_id, occurred_at desc);
create index if not exists idx_analytics_events_session_occurred
  on public.analytics_events_raw (session_id, occurred_at desc);
create index if not exists idx_analytics_events_name_occurred
  on public.analytics_events_raw (event_name, occurred_at desc);

create or replace view public.analytics_sessions as
select
  coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown') as actor_id,
  session_id,
  min(platform) as platform,
  min(surface) as first_surface,
  min(occurred_at) as session_started_at,
  max(occurred_at) as session_ended_at,
  count(*)::bigint as event_count,
  count(distinct event_name)::bigint as distinct_event_count
from public.analytics_events_raw
where nullif(session_id, '') is not null
group by coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'), session_id;

create or replace view public.analytics_daily_user_facts as
select
  date_trunc('day', occurred_at) as event_date,
  platform,
  coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown') as actor_id,
  count(*)::bigint as total_events,
  count(distinct session_id)::bigint as session_count,
  count(*) filter (where event_name = 'feed_post_impression')::bigint as post_impressions,
  count(*) filter (where event_name = 'feed_post_seen')::bigint as post_seen_events,
  count(*) filter (where event_name in ('feed_post_read', 'post_detail_viewed'))::bigint as post_reads,
  count(*) filter (where event_name in ('post_saved', 'post_saved_to_collection'))::bigint as saves,
  count(*) filter (where event_name = 'post_upvoted')::bigint as upvotes,
  count(*) filter (where event_name = 'post_downvoted')::bigint as downvotes,
  count(*) filter (where event_name = 'post_shared')::bigint as shares,
  count(*) filter (where event_name = 'author_followed')::bigint as follows,
  count(*) filter (where event_name = 'feedback_submitted')::bigint as feedback_submissions
from public.analytics_events_raw
group by date_trunc('day', occurred_at), platform, coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown');

create or replace view public.analytics_daily_content_facts as
select
  date_trunc('day', occurred_at) as event_date,
  platform,
  properties->>'post_id' as post_id,
  min(properties->>'author_id') as author_id,
  min(properties->>'topic') as topic,
  count(*) filter (where event_name = 'feed_post_impression')::bigint as impressions,
  count(*) filter (where event_name = 'feed_post_seen')::bigint as seen_events,
  count(*) filter (where event_name in ('feed_post_read', 'post_detail_viewed'))::bigint as reads,
  count(*) filter (where event_name in ('post_saved', 'post_saved_to_collection'))::bigint as saves,
  count(*) filter (where event_name = 'post_unsaved')::bigint as unsaves,
  count(*) filter (where event_name = 'post_upvoted')::bigint as upvotes,
  count(*) filter (where event_name = 'post_downvoted')::bigint as downvotes,
  count(*) filter (where event_name = 'post_source_opened')::bigint as source_opens,
  count(*) filter (where event_name = 'carousel_completed')::bigint as carousel_completions
from public.analytics_events_raw
where nullif(properties->>'post_id', '') is not null
group by date_trunc('day', occurred_at), platform, properties->>'post_id';

create or replace view public.analytics_funnel_facts as
select
  date_trunc('day', occurred_at) as event_date,
  platform,
  count(distinct coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'))
    filter (where event_name = 'landing_viewed')::bigint as landing_viewers,
  count(distinct coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'))
    filter (where event_name = 'signup_started')::bigint as signup_starters,
  count(distinct coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'))
    filter (where event_name = 'signup_completed')::bigint as signup_completers,
  count(distinct coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'))
    filter (where event_name = 'login_completed')::bigint as login_completers,
  count(distinct coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'))
    filter (where event_name = 'feed_viewed')::bigint as feed_viewers,
  count(distinct coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'))
    filter (where event_name = 'feed_post_seen')::bigint as engaged_feed_users,
  count(distinct coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'))
    filter (where event_name in ('post_saved', 'post_upvoted', 'author_followed'))::bigint as activated_users
from public.analytics_events_raw
group by date_trunc('day', occurred_at), platform;

create or replace view public.analytics_recommendation_outcomes as
select
  platform,
  properties->>'post_id' as post_id,
  min(properties->>'author_id') as author_id,
  min(properties->>'topic') as topic,
  min(properties->>'match_reason') as match_reason,
  count(*) filter (where event_name = 'feed_post_impression')::bigint as impressions,
  count(*) filter (where event_name = 'feed_post_seen')::bigint as seen_events,
  count(*) filter (where event_name in ('feed_post_read', 'post_detail_viewed'))::bigint as reads,
  count(*) filter (where event_name in ('post_saved', 'post_saved_to_collection'))::bigint as saves,
  count(*) filter (where event_name = 'post_upvoted')::bigint as upvotes,
  count(*) filter (where event_name = 'post_downvoted')::bigint as downvotes,
  count(*) filter (where event_name = 'carousel_completed')::bigint as carousel_completions,
  count(distinct coalesce(nullif(user_id, ''), nullif(anonymous_id, ''), 'unknown'))::bigint as unique_users
from public.analytics_events_raw
where nullif(properties->>'post_id', '') is not null
group by platform, properties->>'post_id';
