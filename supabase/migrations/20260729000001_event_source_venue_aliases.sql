-- Event-source parsing audit: venue-name reconciliation + missing seeded sources.
--
-- Findings this migration closes (see docs/scraping/EVENT_SOURCE_PLAYBOOK.md):
--
-- 1. VENUE NAME SPLIT. The domain adapters emit "Casey's Center" (the arena's
--    current name) while known_venues only knows it as "Wells Fargo Arena" with
--    aliases ['Wells Fargo', 'The Well', 'WF Arena']. firecrawl-scraper's
--    findMatchingKnownVenue() therefore MISSED on every Barnstormers / Hy-Vee
--    Tix row, so those events got no canonical address and no lat/lng. Worse,
--    the events dedupe fingerprint is title_date_venue, so the same game
--    ingested by two code paths produced two rows.
--
-- 2. MISSING SEEDED SOURCES. Six venues that the crawler is pointed at were
--    never registered as scraping jobs, so they only ever ran via manual
--    one-off admin crawls.
--
-- Everything here is ADDITIVE (array append, INSERT ... WHERE NOT EXISTS,
-- guarded UPDATE) per the backward-compatibility rules in CLAUDE.md: no column
-- is dropped, no constraint tightened, and an admin who has already edited a
-- row is never clobbered.

-- ── 1. Venue aliases ────────────────────────────────────────────────────────

-- Casey's Center is the renamed Wells Fargo Arena. Append rather than replace so
-- the existing aliases keep matching older ingested rows.
UPDATE known_venues
SET aliases = (
  SELECT ARRAY(SELECT DISTINCT unnest(
    COALESCE(aliases, ARRAY[]::text[]) || ARRAY[
      'Casey''s Center',
      'Caseys Center',
      'Casey''s Center at Iowa Events Center'
    ]
  ))
)
WHERE name = 'Wells Fargo Arena';

-- Hoyt Sherman Place: the crawler is seeded with the UNHYPHENATED host, and the
-- venue row's website used the www form. Record both so link checks and the
-- known-venue matcher agree with the allowlist in _shared/fetchGuard.ts.
UPDATE known_venues
SET aliases = (
  SELECT ARRAY(SELECT DISTINCT unnest(
    COALESCE(aliases, ARRAY[]::text[]) || ARRAY[
      'Hoyt Sherman Place Theater',
      'Hoyt Sherman Place Art Gallery'
    ]
  ))
)
WHERE name = 'Hoyt Sherman Place';

-- The Symphony's two homes, so a concert extracted with either string resolves.
UPDATE known_venues
SET aliases = (
  SELECT ARRAY(SELECT DISTINCT unnest(
    COALESCE(aliases, ARRAY[]::text[]) || ARRAY[
      'Des Moines Civic Center',
      'Civic Center'
    ]
  ))
)
WHERE name = 'Civic Center of Greater Des Moines';

-- ── 2. Register the seeded event sources that had no job row ─────────────────
--
-- URLs are the canonical LISTING urls from _shared/eventSourceProfiles.ts, not
-- the venue-profile / month-pinned URLs that were being crawled by hand.
-- Guarded per-name so re-running is a no-op and existing rows are untouched.

INSERT INTO scraping_jobs (id, name, job_type, status, config)
SELECT gen_random_uuid(), v.name, 'event_scraper', 'idle', v.config
FROM (VALUES
  ('Hoyt Sherman Place',
   '{"url": "https://hoytsherman.org/events/", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  ('Des Moines Community Playhouse',
   '{"url": "https://dmplayhouse.com/shows/", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  ('Des Moines Symphony',
   '{"url": "https://www.dmsymphony.org/concerts-events/", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  ('Horizon Events Center',
   '{"url": "https://www.horizoneventscenter.com/upcoming-events/", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  ('Wooly''s / First Fleet Concerts',
   '{"url": "https://www.firstfleetconcerts.com/events", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  ('Eventbrite - West Des Moines',
   '{"url": "https://www.eventbrite.com/d/ia--west-des-moines/events/", "schedule": "0 */12 * * *", "isActive": true}'::jsonb),
  ('SeatGeek - Des Moines Area',
   '{"url": "https://seatgeek.com/search?f=1&search=des+moines&ui_origin=home_search", "schedule": "0 */12 * * *", "isActive": true}'::jsonb)
) AS v(name, config)
WHERE NOT EXISTS (
  SELECT 1 FROM scraping_jobs sj WHERE sj.name = v.name
);

-- ── 3. Repoint seeded URLs that point above the calendar ─────────────────────
--
-- Same pattern as 20260709000000_vibrant_shows_url.sql: only rewrite when the
-- row still holds the original seeded value.

-- Barnstormers: the seed pointed at the site root; the schedule page is what the
-- PrestoSports adapter parses.
UPDATE scraping_jobs
SET config = jsonb_set(
  config, '{url}',
  '"https://theiowabarnstormers.com/sports/fball/2026/schedule"'::jsonb
)
WHERE name = 'Iowa Barnstormers Arena Football'
  AND config->>'url' IN (
    'https://theiowabarnstormers.com/',
    'https://theiowabarnstormers.com'
  );

-- Iowa Cubs is deliberately LEFT ALONE at the unpinned /schedule. milb.ts reads
-- a season year out of the URL when one is present and otherwise uses the
-- current year — so pinning ".../schedule/2026/fullseason" in a recurring job
-- would freeze the crawl on the 2026 season forever. The year-pinned URL is
-- fine for a one-off admin backfill, not for the schedule.
