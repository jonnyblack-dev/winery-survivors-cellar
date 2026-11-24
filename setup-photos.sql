-- Winery Survivors Cellar: wine photos on reviews.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to run more than once.

-- Each review can carry one photo.
alter table public.reviews add column if not exists photo_path text;

-- A private storage bucket: only crew members can see the photos.
-- Photos are shrunk on the phone before upload; 3 MB is a safety limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wine-photos', 'wine-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

-- Crew can view every photo; each person uploads into their own folder;
-- any crew member can delete (so removing a bottle can tidy its photos).
drop policy if exists "crew view wine photos"   on storage.objects;
drop policy if exists "crew upload wine photos" on storage.objects;
drop policy if exists "crew update wine photos" on storage.objects;
drop policy if exists "crew delete wine photos" on storage.objects;

create policy "crew view wine photos" on storage.objects for select to authenticated
  using (bucket_id = 'wine-photos' and public.is_crew());
create policy "crew upload wine photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'wine-photos' and public.is_crew()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "crew update wine photos" on storage.objects for update to authenticated
  using (bucket_id = 'wine-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'wine-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "crew delete wine photos" on storage.objects for delete to authenticated
  using (bucket_id = 'wine-photos' and public.is_crew());
