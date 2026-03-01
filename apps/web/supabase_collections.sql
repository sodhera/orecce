-- ==========================================
-- Collections for Saved Posts
-- ==========================================

-- 1. Create the save_collections table
create table if not exists public.save_collections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Default Collection',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, name)
);

alter table save_collections enable row level security;

drop policy if exists "Users manage own collections" on save_collections;
create policy "Users manage own collections" on save_collections
  for all using (auth.uid() = user_id);

-- 2. Add collection_id column to user_saves
alter table public.user_saves
  add column if not exists collection_id uuid references public.save_collections(id) on delete cascade;

-- 3. Backfill: create a "Default Collection" for every user who has saves,
--    then point their existing saves at it.
do $$
declare
  rec record;
  default_col_id uuid;
begin
  for rec in
    select distinct user_id from public.user_saves where collection_id is null
  loop
    -- Upsert a default collection for the user
    insert into public.save_collections (user_id, name)
    values (rec.user_id, 'Default Collection')
    on conflict (user_id, name) do nothing;

    select id into default_col_id
    from public.save_collections
    where user_id = rec.user_id and name = 'Default Collection';

    update public.user_saves
    set collection_id = default_col_id
    where user_id = rec.user_id and collection_id is null;
  end loop;
end;
$$;

-- ==========================================
-- RPCs
-- ==========================================

-- 4. Ensure a default collection exists for the current user, return its id
create or replace function ensure_default_collection()
returns uuid
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_collection_id uuid;
begin
  select id into v_collection_id
  from save_collections
  where user_id = v_user_id and name = 'Default Collection';

  if v_collection_id is null then
    insert into save_collections (user_id, name)
    values (v_user_id, 'Default Collection')
    on conflict (user_id, name) do nothing
    returning id into v_collection_id;

    -- In case the on-conflict fired, re-select
    if v_collection_id is null then
      select id into v_collection_id
      from save_collections
      where user_id = v_user_id and name = 'Default Collection';
    end if;
  end if;

  return v_collection_id;
end;
$$;

-- 5. Get user collections with post count
create or replace function get_user_collections(
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  collection_id uuid,
  collection_name text,
  post_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Ensure at least the default collection exists
  perform ensure_default_collection();

  return query
  select
    sc.id as collection_id,
    sc.name as collection_name,
    count(us.post_id)::bigint as post_count,
    sc.created_at,
    sc.updated_at
  from save_collections sc
  left join user_saves us on us.collection_id = sc.id
  where sc.user_id = v_user_id
  group by sc.id, sc.name, sc.created_at, sc.updated_at
  order by
    -- Default Collection always first
    case when sc.name = 'Default Collection' then 0 else 1 end,
    sc.created_at asc
  limit p_limit offset p_offset;
end;
$$;

-- 6. Get posts in a specific collection
create or replace function get_collection_posts(
  p_collection_id uuid,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  feed_post_id uuid,
  theme text,
  author_name text,
  author_avatar text,
  source_url text,
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
  -- Verify the collection belongs to the calling user
  if not exists (
    select 1 from save_collections
    where id = p_collection_id and user_id = v_user_id
  ) then
    raise exception 'Collection not found or access denied';
  end if;

  return query
  select distinct on (p.id)
    p.id as feed_post_id,
    p.theme,
    a.name as author_name,
    a.avatar_url as author_avatar,
    p.source_url,
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
  where us.collection_id = p_collection_id
    and us.user_id = v_user_id
  order by p.id, us.created_at desc
  limit p_limit offset p_offset;
end;
$$;
