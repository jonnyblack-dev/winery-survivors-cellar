-- Winery Survivors Cellar: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to run once on a fresh project.

-- 1. Who is allowed in. Add the crew's email addresses in step 2 at the bottom.
create table if not exists public.crew (
  email text primary key,
  name  text not null unique
);

-- 2. Bottles people bought.
create table if not exists public.wines (
  id         uuid primary key default gen_random_uuid(),
  winery     text not null,
  name       text not null check (char_length(name) between 1 and 80),
  vintage    text check (vintage is null or vintage ~ '^(19|20)[0-9]{2}$'),
  price      numeric(7,2) check (price is null or price >= 0),
  bottles    int check (bottles is null or bottles between 0 and 999),
  added_by   text,
  created_at timestamptz not null default now()
);

-- 3. One review per person per wine.
create table if not exists public.reviews (
  wine_id    uuid not null references public.wines(id) on delete cascade,
  reviewer   text not null,
  stars      int  not null check (stars between 1 and 5),
  buy        text not null check (buy in ('yes','maybe','no')),
  note       text check (note is null or char_length(note) <= 400),
  updated_at timestamptz not null default now(),
  primary key (wine_id, reviewer)
);

-- Helpers: is the signed-in person on the crew list, and what's their name?
create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select name from public.crew where lower(email) = lower(auth.jwt() ->> 'email')
$$;
create or replace function public.is_crew() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_name() is not null
$$;

alter table public.wines alter column added_by set default public.my_name();

-- Row level security: only crew can see or change anything.
alter table public.crew    enable row level security;
alter table public.wines   enable row level security;
alter table public.reviews enable row level security;

drop policy if exists crew_read on public.crew;
create policy crew_read on public.crew for select to authenticated using (public.is_crew());

drop policy if exists wines_read   on public.wines;
drop policy if exists wines_add    on public.wines;
drop policy if exists wines_edit   on public.wines;
drop policy if exists wines_remove on public.wines;
create policy wines_read   on public.wines for select to authenticated using (public.is_crew());
create policy wines_add    on public.wines for insert to authenticated with check (public.is_crew() and added_by = public.my_name());
create policy wines_edit   on public.wines for update to authenticated using (public.is_crew()) with check (public.is_crew());
create policy wines_remove on public.wines for delete to authenticated using (public.is_crew());

drop policy if exists reviews_read   on public.reviews;
drop policy if exists reviews_add    on public.reviews;
drop policy if exists reviews_edit   on public.reviews;
drop policy if exists reviews_remove on public.reviews;
create policy reviews_read   on public.reviews for select to authenticated using (public.is_crew());
create policy reviews_add    on public.reviews for insert to authenticated with check (reviewer = public.my_name());
create policy reviews_edit   on public.reviews for update to authenticated using (reviewer = public.my_name()) with check (reviewer = public.my_name());
create policy reviews_remove on public.reviews for delete to authenticated using (reviewer = public.my_name());

-- Next: run setup-join.sql to turn on sign-up with a join link.
-- (Or add people by hand in Table Editor > crew: their email and first name.)
