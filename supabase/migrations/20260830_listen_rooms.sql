create table if not exists public.listen_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  guest_user_id uuid references auth.users(id) on delete set null,
  host_profile jsonb not null default '{}'::jsonb,
  guest_profile jsonb,
  current_track jsonb,
  queue jsonb not null default '[]'::jsonb,
  queue_index integer not null default 0,
  position_seconds numeric not null default 0,
  is_playing boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists listen_rooms_host_idx on public.listen_rooms(host_user_id);
create index if not exists listen_rooms_guest_idx on public.listen_rooms(guest_user_id);

alter table public.listen_rooms enable row level security;

drop policy if exists "listen rooms visible to members" on public.listen_rooms;
create policy "listen rooms visible to members" on public.listen_rooms
  for select using (auth.uid() = host_user_id or auth.uid() = guest_user_id);

drop policy if exists "listen rooms created by host" on public.listen_rooms;
create policy "listen rooms created by host" on public.listen_rooms
  for insert with check (auth.uid() = host_user_id);

drop policy if exists "listen rooms updated by members" on public.listen_rooms;
create policy "listen rooms updated by members" on public.listen_rooms
  for update using (auth.uid() = host_user_id or auth.uid() = guest_user_id)
  with check (auth.uid() = host_user_id or auth.uid() = guest_user_id);

create or replace function public.join_listen_room(p_code text, p_profile jsonb)
returns public.listen_rooms
language plpgsql
security definer
set search_path = public
as $$
declare result public.listen_rooms;
begin
  if auth.uid() is null then
    raise exception '请先登录 Aurora 账号';
  end if;
  update public.listen_rooms
    set guest_user_id = auth.uid(), guest_profile = coalesce(p_profile, '{}'::jsonb), updated_at = now()
    where code = upper(trim(p_code)) and guest_user_id is null and host_user_id <> auth.uid()
    returning * into result;
  if result.id is null then
    raise exception '验证码无效或房间已满';
  end if;
  return result;
end;
$$;

grant execute on function public.join_listen_room(text, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listen_rooms'
  ) then
    alter publication supabase_realtime add table public.listen_rooms;
  end if;
end $$;
