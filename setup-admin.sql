-- Winery Survivors Cellar: admin rights.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Makes Jonny an admin. Admins can edit or remove any bottle, and edit any
-- review or its photo. Everyone else can only change their own. Safe to run
-- more than once.

alter table public.crew add column if not exists is_admin boolean not null default false;
update public.crew set is_admin = true where name = 'Jonny';

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.crew
                   where lower(email) = lower(auth.jwt() ->> 'email')), false)
$$;
grant execute on function public.is_admin() to authenticated;

-- Bottles: whoever added it, or an admin, can edit or remove it.
drop policy if exists wines_edit   on public.wines;
drop policy if exists wines_remove on public.wines;
create policy wines_edit on public.wines for update to authenticated
  using (public.is_crew() and (added_by = public.my_name() or public.is_admin()))
  with check (public.is_crew());
create policy wines_remove on public.wines for delete to authenticated
  using (public.is_crew() and (added_by = public.my_name() or public.is_admin()));

-- Reviews: your own, or anyone's if you're an admin.
drop policy if exists reviews_add    on public.reviews;
drop policy if exists reviews_edit   on public.reviews;
drop policy if exists reviews_remove on public.reviews;
create policy reviews_add on public.reviews for insert to authenticated
  with check (reviewer = public.my_name() or (public.is_admin() and reviewer in (select name from public.crew)));
create policy reviews_edit on public.reviews for update to authenticated
  using (reviewer = public.my_name() or public.is_admin())
  with check (reviewer = public.my_name() or public.is_admin());
create policy reviews_remove on public.reviews for delete to authenticated
  using (reviewer = public.my_name() or public.is_admin());

-- Show who is an admin (should list Jonny):
select name, is_admin from public.crew order by name;
