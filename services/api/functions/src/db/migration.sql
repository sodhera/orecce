-- Orecce: Firestore → Postgres migration schema
-- Run this in the Supabase SQL Editor to create all required tables.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Core user / feed tables
-- ============================================================

create table if not exists app_users (
  id text primary key,
  email text,
  display_name text,
  photo_url text,
  auth_uid text,
  prefill_status text not null default 'empty'
    check (prefill_status in ('empty','generating','ready','error')),
  prefill_post_count int not null default 0,
  prefill_chunk_count int not null default 0,
  prefill_bytes bigint not null default 0,
  prefill_updated_at timestamptz,
  prefill_pointers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prompt_preferences (
  user_id text primary key references app_users(id) on delete cascade,
  biography_instructions text not null default '',
  niche_instructions text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists user_prefill_chunks (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  auth_uid text,
  chunk_index int not null check (chunk_index >= 0),
  size_bytes int not null check (size_bytes >= 0),
  posts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, chunk_index)
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  mode text not null,
  profile text not null,
  profile_key text not null,
  length text not null,
  title text not null,
  body text not null,
  post_type text not null,
  tags text[] not null default '{}',
  confidence text not null,
  uncertainty_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_user_mode_profile_created
  on posts (user_id, mode, profile_key, created_at desc);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  post_id text not null,
  type text not null check (type in ('upvote','downvote','skip')),
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_user_created
  on feedback (user_id, created_at desc);
create index if not exists idx_feedback_user_post_created
  on feedback (user_id, post_id, created_at desc);

create table if not exists user_recommendation_profiles (
  user_id text primary key references app_users(id) on delete cascade,
  theme_weights jsonb not null default '{}'::jsonb,
  signal_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. Recces tables
-- ============================================================

create table if not exists recces_essays (
  author_id text not null,
  essay_id text not null,
  source_title text not null,
  posts jsonb not null,
  updated_at timestamptz,
  primary key (author_id, essay_id)
);

-- ============================================================
-- 3. News tables
-- ============================================================

create table if not exists news_articles (
  id text primary key,
  source_id text not null,
  source_name text not null,
  source jsonb not null,
  canonical_url text not null,
  title text not null,
  summary text not null,
  categories text[] not null default '{}',
  external_id text,
  author text,
  published_at timestamptz,
  feed_fingerprint text,
  fingerprint text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  full_text_status text,
  full_text_error text,
  full_text_length int,
  full_text_chunk_count int,
  full_text_fingerprint text,
  full_text_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_url)
);

create index if not exists idx_news_articles_source_published
  on news_articles (source_id, published_at desc);

create table if not exists news_article_text_chunks (
  id text primary key,
  article_id text not null references news_articles(id) on delete cascade,
  chunk_index int not null check (chunk_index >= 0),
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, chunk_index)
);

create table if not exists news_source_state (
  source_id text primary key,
  source_name text not null,
  feed_url text not null,
  homepage_url text not null,
  language text not null,
  country_code text,
  last_status text,
  last_run_id text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  fetched_count int,
  inserted_count int,
  updated_count int,
  unchanged_count int,
  duration_ms int,
  last_http_status int,
  updated_at timestamptz not null default now()
);

create table if not exists news_sync_runs (
  run_id text primary key,
  schedule text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,
  source_count int,
  success_count int,
  error_count int,
  skipped_count int,
  total_fetched_count int,
  total_inserted_count int,
  total_updated_count int,
  total_unchanged_count int,
  source_results jsonb not null default '[]'::jsonb
);

-- ============================================================
-- 4. Sports news tables
-- ============================================================

create table if not exists user_sports_news_stories (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  sport text not null,
  source_id text not null,
  source_name text not null,
  title text not null,
  canonical_url text not null,
  published_at timestamptz,
  game_id text not null,
  game_name text not null,
  game_date_key text not null,
  importance_score numeric not null default 0,
  bullet_points text[] not null default '{}',
  reconstructed_article text not null default '',
  story text not null default '',
  preview text not null default '',
  full_text_status text,
  summary_source text,
  rank int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_usns_user_published_id
  on user_sports_news_stories (user_id, published_at desc, id desc);
create index if not exists idx_usns_user_sport_published_id
  on user_sports_news_stories (user_id, sport, published_at desc, id desc);

create table if not exists user_sports_news_game_drafts (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  sport text not null,
  game_id text not null,
  game_name text not null,
  game_date_key text not null,
  article_count int not null default 0,
  articles jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sport, game_id)
);

create table if not exists user_sports_news_sync_state (
  user_id text not null references app_users(id) on delete cascade,
  sport text not null,
  status text not null,
  step text not null,
  message text not null,
  total_games int not null default 0,
  processed_games int not null default 0,
  found_games text[] not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  error_message text,
  primary key (user_id, sport)
);

create table if not exists user_sports_news_refresh_jobs (
  user_id text not null references app_users(id) on delete cascade,
  sport text not null,
  status text not null,
  pending boolean not null default false,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  error_message text,
  primary key (user_id, sport)
);
