-- ============================================================================
-- WEB-DB-005: Constrain the unbounded anonymous INSERT on web_vitals
-- ============================================================================
-- The original web_vitals_insert_any policy used WITH CHECK (true) with no role
-- target, so any caller could insert arbitrary/oversized rows into a table that
-- accepts anonymous beacons — a cheap way to flood the table.
--
-- This replaces it with a bounded policy that still accepts legitimate real-user
-- web-vitals beacons (WEB-PERF-007, src/lib/webVitalsRum.ts) but rejects
-- payloads outside the expected shape: only the known metric/rating enums, a
-- sane numeric range, and length caps on the free-text columns. Scoped to the
-- roles that actually report (anon + authenticated); service_role bypasses RLS.
--
-- web_vitals is web-only RUM (no mobile binary inserts here), so tightening this
-- policy carries no mobile backward-compat risk.
-- ============================================================================

DROP POLICY IF EXISTS "web_vitals_insert_any" ON public.web_vitals;
DROP POLICY IF EXISTS "web_vitals_insert_bounded" ON public.web_vitals;

CREATE POLICY "web_vitals_insert_bounded"
  ON public.web_vitals FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    metric IN ('LCP', 'CLS', 'INP', 'TTFB', 'FCP')
    AND value >= 0 AND value <= 3600000            -- ms/score sanity bound (1h)
    AND char_length(page_group) <= 128
    AND (path IS NULL OR char_length(path) <= 512)
    AND (rating IS NULL OR rating IN ('good', 'needs-improvement', 'poor'))
    AND (session_id IS NULL OR char_length(session_id) <= 64)
  );

COMMENT ON POLICY "web_vitals_insert_bounded" ON public.web_vitals IS
  'WEB-DB-005: anon/authenticated RUM beacons only, shape- and size-bounded.';
