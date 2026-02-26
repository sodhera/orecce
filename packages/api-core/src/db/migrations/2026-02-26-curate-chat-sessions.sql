-- Store persisted right-sidebar curate chats per user session.

create table if not exists curate_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  session_id text not null,
  transcript jsonb not null default '{}'::jsonb,
  message_count int not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_curate_chat_sessions_user_session
  on curate_chat_sessions (user_id, session_id);

create index if not exists idx_curate_chat_sessions_user_updated
  on curate_chat_sessions (user_id, updated_at desc);
