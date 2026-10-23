-- ============================================================
-- v2.0.0 – Storage bucket for Kyri's own exercise videos.
-- Run once in Supabase → SQL Editor (after 007). Safe to run again.
-- Files live under <trainer_id>/<file>. Only the trainer can upload/delete;
-- the files are readable by link (long random names), so they play in the client app.
-- Max size per file is set below (50 MB = Supabase free plan limit).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-videos', 'exercise-videos', true, 52428800, array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercise videos upload" on storage.objects;
create policy "exercise videos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-videos' and public.is_trainer_admin(((storage.foldername(name))[1])::uuid));

drop policy if exists "exercise videos change" on storage.objects;
create policy "exercise videos change" on storage.objects for update to authenticated
  using (bucket_id = 'exercise-videos' and public.is_trainer_admin(((storage.foldername(name))[1])::uuid));

drop policy if exists "exercise videos delete" on storage.objects;
create policy "exercise videos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-videos' and public.is_trainer_admin(((storage.foldername(name))[1])::uuid));
