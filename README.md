# Winery Survivors Cellar

A small private website where the crew from the November 2026 South Australia wine weekend logs the bottles they bought, rates them, and votes on which to reorder.

- Hosting: GitHub Pages (free), straight from this repository.
- Database and sign-in: Supabase (free plan). Sign-in is by emailed link; only emails in the `crew` table can see or change anything.

## Files
- `index.html`, `app.js`: the site.
- `config.js`: the Supabase project URL and anon (public) key. Never put the service_role key here.
- `setup.sql`: run once in Supabase SQL Editor to create the tables and access rules.

## Adding someone
Supabase > Table Editor > `crew` > Insert row: their email and their first name.

Note: free Supabase projects pause after a week with no visits. If the site stops loading, open the Supabase dashboard and click Restore.
