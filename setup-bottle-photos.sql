-- Winery Survivors Cellar: a main photo for each bottle.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Uses the same private photo storage as review photos (setup-photos.sql runs first).
-- Safe to run more than once.
alter table public.wines add column if not exists photo_path text;
