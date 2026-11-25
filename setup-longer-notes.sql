-- Winery Survivors Cellar: allow longer tasting notes (up to 2,000 characters).
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to run more than once.
alter table public.reviews drop constraint if exists reviews_note_check;
alter table public.reviews add constraint reviews_note_check
  check (note is null or char_length(note) <= 2000);
