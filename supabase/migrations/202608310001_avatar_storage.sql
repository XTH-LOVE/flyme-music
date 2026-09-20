insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatar images are public" on storage.objects;
create policy "avatar images are public" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "users upload their avatar" on storage.objects;
create policy "users upload their avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update their avatar" on storage.objects;
create policy "users update their avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
