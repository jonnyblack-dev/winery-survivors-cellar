-- Winery Survivors Cellar: let signed-in people use the tables.
-- Newer Supabase projects don't open new tables to the website automatically,
-- so this grants signed-in users access. Row level security (in setup.sql)
-- still limits everything to the crew. Paste into SQL Editor and click Run.
-- Safe to run more than once.

grant usage on schema public to authenticated;
grant select on public.crew to authenticated;
grant select, insert, update, delete on public.wines   to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
grant execute on function public.my_name()  to authenticated;
grant execute on function public.is_crew()  to authenticated;
grant execute on function public.join_crew(text, text) to authenticated;
