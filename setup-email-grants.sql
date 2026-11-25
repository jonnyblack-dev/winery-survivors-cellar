-- Winery Survivors Cellar: let the review-email function read the crew list.
-- The notify-review function runs as Supabase's "service_role". This project
-- doesn't open new tables to it automatically, so it couldn't read the crew
-- or mark a review as announced. Paste into SQL Editor and click Run.
-- Safe to run more than once.

grant usage on schema public to service_role;
grant select on public.crew to service_role;
grant select on public.wines to service_role;
grant select, update on public.reviews to service_role;
