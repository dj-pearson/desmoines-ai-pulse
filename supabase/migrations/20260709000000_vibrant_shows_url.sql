-- WEB-AUTO-017: point the seeded Vibrant Music Hall scraping job at /shows.
--
-- The seed (20260226000000_create_scraping_jobs.sql) registered Vibrant with
-- config.url = https://www.vibrantmusichall.com/ (the homepage). Only /shows is
-- server-rendered with the schema.org MusicEvent ld+json blocks the new
-- vibrantmusichall domain adapter parses, so the job must target /shows for the
-- adapter path to yield event-specific data (images, dates, per-event
-- Ticketmaster URLs) instead of a list-page shell.
--
-- Additive/idempotent: only rewrites the row when it still holds the seeded
-- homepage URL, so an admin who has since edited the URL is never clobbered.
UPDATE scraping_jobs
SET config = jsonb_set(config, '{url}', '"https://www.vibrantmusichall.com/shows"'::jsonb)
WHERE name = 'Vibrant Music Hall'
  AND config->>'url' IN (
    'https://www.vibrantmusichall.com/',
    'https://www.vibrantmusichall.com'
  );
