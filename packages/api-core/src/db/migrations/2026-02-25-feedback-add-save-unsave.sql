-- Forward migration for existing databases:
-- Expand feedback.type to support save state events.

do $$
declare
  c record;
begin
  -- Drop any existing CHECK constraints on feedback.type so we can recreate
  -- a single canonical constraint with the new allowed values.
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'feedback'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%type%'
      and pg_get_constraintdef(con.oid) ilike '%upvote%'
  loop
    execute format('alter table public.feedback drop constraint if exists %I', c.conname);
  end loop;
end
$$;

alter table if exists public.feedback
  add constraint feedback_type_check
  check (type in ('upvote','downvote','skip','save','unsave'));
