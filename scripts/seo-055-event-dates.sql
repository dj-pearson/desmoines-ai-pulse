-- SEO-055: event days, start times and runs. Applied to production 2026-10-01
-- with psql against SUPABASE_DB_URL, in one transaction. Every row touched was
-- saved first to scripts/content-backups/seo-055/ (events + the one article).
--
-- WHAT THE DATA SAID. The story assumed date-only events were stored at
-- 00:00 UTC and so filed a day early. Of the 147 upcoming visible rows at
-- exactly 00:00 UTC, 146 are 19:00 Central (CDT) and one is 18:00 CST. 19:00
-- Central was the catchdesmoines crawler's "no time given" default, and it is
-- also a real start time for most of these shows (SeatGeek's own URLs read
-- "...-2026-10-01-7-pm"). The Central DATE on those rows is the date the source
-- gave, so no row moves day and no slug changes because of the timestamp.
--
-- So this does three narrow things, each from evidence:
--   1. time_tbd = true on upcoming 19:00-Central rows nothing corroborates as a
--      real 7 pm (not a SeatGeek/Ticketmaster listing, no "7 pm" in the source
--      URL or description). The site then shows the date only. Reversible from
--      the backup; time_tbd is an existing column (default false).
--   2. end_date on two multi-day runs whose dates are on their own pages,
--      fetched 2026-10-01:
--        Ringling Bros. (iowaeventscenter.com): Oct 1 7 pm through Oct 4 5 pm.
--        Pumpkin Fest (centergroveorchard.com): "October 1 - November 6".
--   3. The Slaughterhouse row 83b04842 said Thu Oct 1 7 pm; HauntPay lists the
--      first night as "Fri, October 2nd, 2026 @ 7:00PM CDT" (SEO-032 found the
--      same). The row moves to Oct 2, so its URL changes from
--      /events/the-slaughterhouse-haunted-house-2026-10-01 to ...-2026-10-02;
--      public/_redirects keeps the old one as a 301, and the SEO-032 haunted
--      houses article's link is repointed.

begin;

-- 1. Uncorroborated 7 pm -> time not stated.
update public.events e
set time_tbd = true
where e.date >= now() - interval '1 day'
  and (e.date at time zone 'America/Chicago')::time = '19:00:00'
  and coalesce(e.is_hidden, false) = false
  and coalesce(e.is_merged, false) = false
  and e.archived_at is null
  and coalesce(e.time_tbd, false) = false
  and e.id <> '83b04842-55e8-4166-ad12-ea5d58fde766'
  and coalesce(substring(e.source_url from '^https?://(?:www\.)?([^/]+)'), '') !~ '(seatgeek\.com|ticketmaster)'
  and coalesce(e.source_url, '') !~* '(^|[-/])7-?pm([-/]|$)'
  and coalesce(e.original_description, '') !~* '\m7(:00)?\s*p\.?m';

-- 2. Runs.
update public.events
set end_date = timestamptz '2026-10-04 17:00:00 America/Chicago',
    time_tbd = true
where id = '6def3885-c6d3-43a0-bddd-b0d8dca1fded';

update public.events
set end_date = timestamptz '2026-11-06 23:59:00 America/Chicago',
    time_tbd = true
where id = '64b15ad7-1434-4f8d-921a-ec14c58bde4c';

-- 3. The Slaughterhouse opens Friday Oct 2, 7 pm.
update public.events
set date = timestamptz '2026-10-02 19:00:00 America/Chicago',
    event_start_utc = timestamptz '2026-10-02 19:00:00 America/Chicago',
    event_start_local = timestamp '2026-10-02 19:00:00',
    time_tbd = false
where id = '83b04842-55e8-4166-ad12-ea5d58fde766';

-- The SEO-032 article links the old URL. Replica mode so the publish webhook
-- (fires on every UPDATE) does not post it to social again; the text changes
-- only inside a URL, so word_count and updated_at are left alone.
set local session_replication_role = replica;
update public.articles
set content = replace(content,
  '/events/the-slaughterhouse-haunted-house-2026-10-01)',
  '/events/the-slaughterhouse-haunted-house-2026-10-02)')
where slug = 'haunted-houses-near-des-moines';
set local session_replication_role = origin;

select id, left(title, 50) title, date at time zone 'America/Chicago' as central,
       end_date at time zone 'America/Chicago' as end_central, time_tbd
from public.events
where id in ('6def3885-c6d3-43a0-bddd-b0d8dca1fded', '64b15ad7-1434-4f8d-921a-ec14c58bde4c',
             '83b04842-55e8-4166-ad12-ea5d58fde766');

commit;
