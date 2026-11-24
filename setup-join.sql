-- Winery Survivors Cellar: self sign-up with a join link.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- The result at the bottom shows your secret join code. Safe to run more than once.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.settings (
  id        int primary key default 1 check (id = 1),
  join_code text not null
);
insert into private.settings (id, join_code)
values (1, substr(md5(random()::text || clock_timestamp()::text), 1, 12))
on conflict (id) do nothing;

-- Called by the site after someone signs in through the join link.
create or replace function public.join_crew(code text, display_name text) returns text
language plpgsql security definer set search_path = public, private as $$
declare
  em text := lower(auth.jwt() ->> 'email');
  nm text := btrim(display_name);
  existing text;
begin
  if em is null then raise exception 'Sign in first.'; end if;
  if code is null or code <> (select join_code from private.settings where id = 1) then
    raise exception 'That join link isn''t valid. Ask Jonny for the latest one.';
  end if;
  select name into existing from public.crew where lower(email) = em;
  if existing is not null then return existing; end if;
  if nm is null or char_length(nm) < 1 or char_length(nm) > 30 then
    raise exception 'Type a name between 1 and 30 characters.';
  end if;
  if exists (select 1 from public.crew where lower(name) = lower(nm)) then
    raise exception 'Someone has already joined as %. Try adding an initial.', nm;
  end if;
  insert into public.crew (email, name) values (em, nm);
  return nm;
end $$;

revoke all on function public.join_crew(text, text) from public, anon;
grant execute on function public.join_crew(text, text) to authenticated;

-- Your join code (copy it from the results below):
select join_code from private.settings where id = 1;

-- To change the code later (old links stop working), run:
-- update private.settings set join_code = substr(md5(random()::text), 1, 12) where id = 1;
-- select join_code from private.settings;
