-- AI long-term memory: one row per remembered fact, RLS-isolated per user.
create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('artist','genre','mood','fact','dislike')),
  content text not null check (char_length(content) between 1 and 200),
  weight real not null default 1,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists ai_memories_user_idx on public.ai_memories (user_id, last_seen_at desc);
alter table public.ai_memories enable row level security;
drop policy if exists "memories_owner_all" on public.ai_memories;
create policy "memories_owner_all" on public.ai_memories
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
