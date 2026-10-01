-- SEO-050: a home for manual Search Console exports.
--
-- The GSC UI export (Performance > Export > CSV) is an AGGREGATE over a date
-- range: Queries.csv and Pages.csv carry one row per query or page with clicks,
-- impressions, CTR and position summed over the whole window. The two sync
-- tables are DAILY: one row per (property, query|page, date, country), and at
-- least nine readers sum them across dates (useGscPerformance, four
-- SearchTrafficDashboard panels, generate-prerender-priority,
-- generate-pseo-demand-routes, generate-dynamic-sitemaps, prerender). A 91-day
-- aggregate written into a daily table lands on one date, gets summed with the
-- daily rows for that same window, and inflates every one of those readers.
-- On the unique key it would also collide with, and overwrite, the real daily
-- row for that date.
--
-- So exports get their own table, keyed by the range they cover. Re-importing
-- the same export is a no-op; a different range is a different set of rows.
--
-- Keyed by property_url, not by gsc_properties.id: the perf tables reference
-- gsc_properties ON DELETE CASCADE, which is how a reconnect could have wiped
-- them (see gsc-oauth). An export is a file someone kept; it should survive the
-- property row being deleted and recreated.
--
-- Additive only: a new table, nothing existing is touched.

CREATE TABLE IF NOT EXISTS public.gsc_export_performance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_url  text NOT NULL,
  dimension     text NOT NULL CHECK (dimension IN ('query', 'page')),
  key           text NOT NULL,
  range_start   date NOT NULL,
  range_end     date NOT NULL,
  search_type   text NOT NULL DEFAULT 'web',
  clicks        integer NOT NULL DEFAULT 0,
  impressions   bigint NOT NULL DEFAULT 0,
  -- Percent, as the export prints it (14.89 for "14.89%"), matching how
  -- gsc-sync-data stores ctr in the daily tables.
  ctr           numeric,
  position      numeric,
  -- The export folder name, e.g. desmoinesinsider.com-Performance-on-Search-2026-09-30.
  source        text NOT NULL,
  imported_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gsc_export_performance_range_check CHECK (range_end >= range_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS gsc_export_performance_unique
  ON public.gsc_export_performance (property_url, dimension, search_type, range_start, range_end, key);

CREATE INDEX IF NOT EXISTS gsc_export_performance_range
  ON public.gsc_export_performance (property_url, range_end DESC);

ALTER TABLE public.gsc_export_performance ENABLE ROW LEVEL SECURITY;

-- Same posture as the four gsc_* tables: admin-only, read and write.
DROP POLICY IF EXISTS "Admin full access to gsc_export_performance" ON public.gsc_export_performance;
CREATE POLICY "Admin full access to gsc_export_performance"
  ON public.gsc_export_performance
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.gsc_export_performance IS
  'Manual Search Console UI exports (range aggregates). Not daily data: never sum with gsc_keyword_performance / gsc_page_performance. Loaded by scripts/import-gsc-export.mjs.';
