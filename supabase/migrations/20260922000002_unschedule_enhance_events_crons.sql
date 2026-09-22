-- Unschedule enhance-events-morning and enhance-events-evening.
--
-- Both have posted {"limit": 50, "forceRefresh": false} to batch-enhance-events
-- since 20250107000006. That function has never had a mode that chooses events
-- itself - it requires eventIds - so every run failed (a TypeError until
-- 2026-08, a 400 since). Both are in cron-health-baseline.json's failing list.
-- Nothing has ever been enhanced by them, so removing them changes no data.
--
-- Not replaced with a selection mode, on purpose. batch-enhance-events writes
-- whatever the model returns from Google snippets into the row, `venue`
-- included, and `venue` is part of events_title_venue_date_unique and is set at
-- ingest from known_venues. Unattended, that trades a canonical venue for a
-- guessed one. The function stays for the admin UI (EventDataEnhancer), where a
-- person picks the events and the fields. AI write-ups are filled from the admin
-- UI by bulk-enhance-events; SEO fields, images and coordinates nightly by
-- data-quality-heal-nightly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; nothing to unschedule';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enhance-events-morning') THEN
    PERFORM cron.unschedule('enhance-events-morning');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enhance-events-evening') THEN
    PERFORM cron.unschedule('enhance-events-evening');
  END IF;
END $$;
