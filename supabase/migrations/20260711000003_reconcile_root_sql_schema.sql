-- =====================================================================
-- WEB-DB-006: Reconcile previously-untracked root-level *.sql files
-- =====================================================================
-- Historically, 34 loose *.sql files lived in the repository ROOT (not in
-- supabase/migrations/). They were applied ad-hoc via the Supabase SQL
-- Editor and never entered the tracked migration ledger. This migration
-- captures the SUBSET of those files that made real, additive schema
-- changes which are NOT already present in a tracked migration.
--
-- Everything here is written to be FULLY IDEMPOTENT and a NO-OP against a
-- database that already has these shapes (ADD COLUMN IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, guarded DO blocks with existence checks).
-- Only additive/idempotent DDL — no bare DROP COLUMN or destructive change.
--
-- What is captured here (un-tracked, additive):
--   1. restaurants.opening_timeframe        (from add_opening_timeframe*.sql,
--                                             complete_restaurants_migration.sql)
--   2. restaurant_openings.opening_timeframe (guarded — table may not exist;
--                                             from add_opening_timeframe_to_openings.sql)
--   3. restaurants.source_url               (from manual_migration.sql)
--
-- What is DELIBERATELY NOT captured (already tracked or excluded):
--   * restaurants.city              -> already in 20250100000000_baseline_tables.sql
--   * restaurants.opening_date      -> already in 20250728165446_add_opening_column_to_restaurants.sql
--   * restaurants.status (+CHECK)   -> already in 20250728165446_add_opening_column_to_restaurants.sql
--   * events/restaurants.ai_writeup -> already in 20250730120000_add_ai_writeup_fields.sql
--                                      (restaurants.ai_writeup also in baseline)
--   * DROP COLUMN restaurants.opening (cleanup_duplicate_column.sql)
--                                    -> EXCLUDED: destructive, violates the
--                                       Backward Compatibility deprecation flow.
--   * data-only backfills / status normalization (fix_status_values.sql,
--     add-restaurant-city-column.sql UPDATEs) -> obsolete one-off data fixes,
--     the status CHECK constraint already enforces valid values.
--   * all cron / pg_cron / http-extension setup -> superseded by tracked
--     migrations (…_setup_cron_scraping.sql, 20260710000000_repoint_agent_crons_to_runner.sql, …)
--
-- See docs/ROOT_SQL_RECONCILIATION.md for the full 34-file disposition table.
-- =====================================================================

-- 1. restaurants.opening_timeframe -----------------------------------------
-- Approximate opening timeframe when an exact opening_date is unavailable
-- (e.g. "Summer 2025", "Fall 2024"). Additive, nullable.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS opening_timeframe TEXT;

COMMENT ON COLUMN public.restaurants.opening_timeframe IS
  'Approximate opening timeframe when exact date is not available (e.g., "Summer 2025", "Fall 2024")';

CREATE INDEX IF NOT EXISTS idx_restaurants_opening_timeframe
  ON public.restaurants(opening_timeframe)
  WHERE opening_timeframe IS NOT NULL;

-- 2. restaurant_openings.opening_timeframe ---------------------------------
-- The legacy root scripts also mirrored this column onto restaurant_openings.
-- That table is NOT defined in the tracked migration ledger, so guard the
-- change behind an existence check to keep this migration a safe no-op when
-- the table is absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'restaurant_openings'
  ) THEN
    ALTER TABLE public.restaurant_openings
      ADD COLUMN IF NOT EXISTS opening_timeframe TEXT;

    EXECUTE 'COMMENT ON COLUMN public.restaurant_openings.opening_timeframe IS '
         || '''Approximate opening timeframe when exact date is not available (e.g., "Summer 2025", "Fall 2024")''';
  END IF;
END $$;

-- 3. restaurants.source_url -------------------------------------------------
-- Provenance URL for restaurant records ingested by crawlers. Additive,
-- nullable. Present in the legacy manual_migration.sql but never tracked.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN public.restaurants.source_url IS
  'Origin URL from which this restaurant record was ingested (crawler provenance)';
