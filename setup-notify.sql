-- Winery Survivors Cellar: email the crew when a new review is posted.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Only people in the cellar's crew list are ever emailed (never other users
-- of this Supabase project). Safe to run more than once.

-- Each member can switch the emails off.
alter table public.crew add column if not exists notify boolean not null default true;

-- Each review is announced once, the first time it's posted.
alter table public.reviews add column if not exists notified_at timestamptz;
update public.reviews set notified_at = now() where notified_at is null;

-- Let a member turn their own emails on or off (and nothing else).
create or replace function public.set_my_notify(on_off boolean) returns boolean
language sql security definer set search_path = public as $$
  update public.crew set notify = on_off
  where lower(email) = lower(auth.jwt() ->> 'email')
  returning notify
$$;
revoke all on function public.set_my_notify(boolean) from public, anon;
grant execute on function public.set_my_notify(boolean) to authenticated;
