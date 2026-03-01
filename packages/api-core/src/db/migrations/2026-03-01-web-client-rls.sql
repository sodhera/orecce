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

create table if not exists public.save_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Default Collection',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, name)
);

alter table public.user_saves
  add column if not exists collection_id uuid references public.save_collections(id) on delete cascade;

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null,
  message text not null,
  created_at timestamptz default now()
);

alter table public.user_likes enable row level security;
alter table public.user_saves enable row level security;
alter table public.save_collections enable row level security;
alter table public.user_feedback enable row level security;

drop policy if exists "Users manage own likes" on public.user_likes;
create policy "Users manage own likes" on public.user_likes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own saves" on public.user_saves;
create policy "Users manage own saves" on public.user_saves
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own collections" on public.save_collections;
create policy "Users manage own collections" on public.save_collections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Insert feedback" on public.user_feedback;
drop policy if exists "user_feedback_insert_policy" on public.user_feedback;
drop policy if exists "Enable insert for all users" on public.user_feedback;
create policy "Enable insert for all users" on public.user_feedback
  for insert
  with check (true);
