# Winery Survivors Cellar

A small private website where the crew from the November 2026 South Australia wine weekend logs the bottles they bought, rates them, and votes on which to reorder.

- Hosting: GitHub Pages (free), straight from this repository.
- Database and sign-in: Supabase (free plan). Sign-in is by emailed link; only emails in the `crew` table can see or change anything.

## Files
- `index.html`, `app.js`: the site.
- `config.js`: the Supabase project URL and anon (public) key. Never put the service_role key here.
- `setup.sql`: run once in Supabase SQL Editor to create the tables and access rules.
- `setup-grants.sql`: run after `setup.sql` so signed-in people can use the tables (newer Supabase projects need it).
- `setup-photos.sql`: adds wine photos on reviews (a private storage bucket only the crew can see).
- `setup-bottle-photos.sql`: lets each bottle have its own main photo (run after `setup-photos.sql`).
- `setup-longer-notes.sql`: raises the tasting-note limit from 400 to 2,000 characters.
- `setup-notify.sql` + `supabase/functions/notify-review/`: emails the crew (only the crew) when someone posts a new review, through Gmail. Needs the Edge Function deployed and the secrets `GMAIL_USER` and `GMAIL_APP_PASSWORD`. Members can untick "Email me about new reviews". Also run `setup-email-grants.sql` so the function can read the crew list.
- `setup-admin.sql`: makes Jonny an admin who can edit any bottle, review or photo. To make someone else an admin: `update crew set is_admin = true where name = 'Name';`
- `setup-join.sql`: run once after `setup.sql` to turn on sign-up by join link. It prints the secret join code.

## Adding someone
Send them the join link: `https://jonnyblack-dev.github.io/winery-survivors-cellar/?join=CODE`, where CODE comes from running `setup-join.sql`. They sign in with their email, type their first name, and they're in.
To stop old links working, change the code (see the bottom of `setup-join.sql`).
You can also add people by hand: Supabase > Table Editor > `crew` > Insert row.

Note: free Supabase projects pause after a week with no visits. If the site stops loading, open the Supabase dashboard and click Restore.
