-- Cross-device library sync: one JSONB snapshot row per account.
-- Row-level security mirrors ai_memories; payload shapes come from
-- utils/backup.ts (favorites / recentTracks / playLog / playlists).
create table if not exists public.user_library (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  recent_tracks jsonb not null default '[]'::jsonb,
  play_log jsonb not null default '[]'::jsonb,
  playlists jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_library enable row level security;

drop policy if exists "library_owner_all" on public.user_library;
create policy "library_owner_all" on public.user_library
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
