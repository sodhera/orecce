-- Forward migration for existing databases:
-- Track which recommendation posts each user has already seen.

create table if not exists public.user_recommendation_seen_posts (
  user_id text not null references public.app_users(id) on delete cascade,
  author_id text not null,
  post_id text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, author_id, post_id)
);

create index if not exists idx_user_reco_seen_user_author_last_seen
  on public.user_recommendation_seen_posts (user_id, author_id, last_seen_at desc);
