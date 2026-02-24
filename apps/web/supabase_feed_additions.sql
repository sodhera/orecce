-- ==========================================
-- Additional tables: Likes & Saves
-- ==========================================

create table if not exists public.user_likes (
  user_id uuid references auth.users(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

create table if not exists public.user_saves (
  user_id uuid references auth.users(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

alter table user_likes enable row level security;
alter table user_saves enable row level security;

drop policy if exists "Users manage own likes" on user_likes;
drop policy if exists "Users manage own saves" on user_saves;

create policy "Users manage own likes" on user_likes for all using (auth.uid() = user_id);
create policy "Users manage own saves" on user_saves for all using (auth.uid() = user_id);

-- ==========================================
-- Updated feed RPC with has_liked / has_saved
-- ==========================================

create or replace function get_personalized_feed(
  p_limit int default 10,
  p_offset int default 0,
  p_author_id uuid default null
)
returns table (
  feed_post_id uuid,
  theme text,
  author_name text,
  author_avatar text,
  slides jsonb,
  post_type text,
  tags text[],
  global_popularity_score float,
  match_reason text,
  has_liked boolean,
  has_saved boolean
)
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return query
  with
  my_authors as (
    select uaf.author_id from user_author_follows uaf where uaf.user_id = v_user_id
  ),
  my_topics as (
    select utf.topic_id from user_topic_follows utf where utf.user_id = v_user_id
  ),
  exclude_posts as (
    select uh.post_id as excluded_id from user_history uh
    where uh.user_id = v_user_id
    and uh.status in ('read', 'skipped')
  )

  select distinct on (p.id)
    p.id as feed_post_id,
    p.theme,
    a.name as author_name,
    a.avatar_url as author_avatar,
    p.slides,
    p.post_type,
    p.tags,
    p.global_popularity_score,
    case
      when p.author_id in (select ma.author_id from my_authors ma) then 'Following Author'
      else 'Following Topic'
    end as match_reason,
    exists(select 1 from user_likes ul where ul.user_id = v_user_id and ul.post_id = p.id) as has_liked,
    exists(select 1 from user_saves us where us.user_id = v_user_id and us.post_id = p.id) as has_saved
  from posts p
  join authors a on p.author_id = a.id
  left join post_topics pt on p.id = pt.post_id
  where
    (
      case
        when p_author_id is not null then p.author_id = p_author_id
        else (
          p.author_id in (select ma.author_id from my_authors ma)
          OR
          pt.topic_id in (select mt.topic_id from my_topics mt)
        )
      end
    )
    AND p.id not in (select ep.excluded_id from exclude_posts ep)
  order by p.id, p.global_popularity_score desc
  limit p_limit offset p_offset;
end;
$$;

-- ── 3. GET USER LIKED POSTS RPC ──
create or replace function get_user_liked_posts(
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  feed_post_id uuid,
  theme text,
  author_name text,
  author_avatar text,
  slides jsonb,
  post_type text,
  tags text[],
  global_popularity_score float,
  match_reason text,
  has_liked boolean,
  has_saved boolean
)
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return query
  select distinct on (p.id)
    p.id as feed_post_id,
    p.theme,
    a.name as author_name,
    a.avatar_url as author_avatar,
    p.slides,
    p.post_type,
    p.tags,
    p.global_popularity_score,
    'Liked' as match_reason,
    true as has_liked,
    exists(select 1 from user_saves us where us.user_id = v_user_id and us.post_id = p.id) as has_saved
  from user_likes ul
  join posts p on ul.post_id = p.id
  join authors a on p.author_id = a.id
  where ul.user_id = v_user_id
  order by p.id, ul.created_at desc
  limit p_limit offset p_offset;
end;
$$;

-- ── 4. GET USER SAVED POSTS RPC ──
create or replace function get_user_saved_posts(
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  feed_post_id uuid,
  theme text,
  author_name text,
  author_avatar text,
  slides jsonb,
  post_type text,
  tags text[],
  global_popularity_score float,
  match_reason text,
  has_liked boolean,
  has_saved boolean
)
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return query
  select distinct on (p.id)
    p.id as feed_post_id,
    p.theme,
    a.name as author_name,
    a.avatar_url as author_avatar,
    p.slides,
    p.post_type,
    p.tags,
    p.global_popularity_score,
    'Saved' as match_reason,
    exists(select 1 from user_likes ul where ul.user_id = v_user_id and ul.post_id = p.id) as has_liked,
    true as has_saved
  from user_saves us
  join posts p on us.post_id = p.id
  join authors a on p.author_id = a.id
  where us.user_id = v_user_id
  order by p.id, us.created_at desc
  limit p_limit offset p_offset;
end;
$$;

-- ── 5. USER FEEDBACK TABLE AND RLS ──
create table if not exists user_feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null,
  message text not null,
  created_at timestamptz default now()
);

alter table user_feedback enable row level security;

-- Allow authenticated users and anonymous users to insert feedback
drop policy if exists "Insert feedback" on user_feedback;
drop policy if exists "user_feedback_insert_policy" on user_feedback;
drop policy if exists "Enable insert for all users" on user_feedback;

create policy "Enable insert for all users" on user_feedback
  for insert
  with check (true);


