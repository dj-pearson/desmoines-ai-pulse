-- IOS-DD-MAP-01 / 02 / 03: the three "what's near me" RPCs behind the map
-- return only live rows, clamp what an anonymous caller can ask for, and stop
-- ranking by an unlabelled featured flag.
--
-- As they stood:
--   * search_events_near_location (20251110000000) is SECURITY DEFINER with no
--     search_path, granted to anon, and filtered on `date >= CURRENT_DATE` and
--     distance only. Merged, hidden and archived events came back, a festival
--     in its second day did not (no end_date arm), and "today" was the UTC
--     date. ORDER BY put is_featured first, so the nearest-first list was an
--     unlabelled ad slot. radius_meters and search_limit went in unclamped.
--   * restaurants_within_radius (20250107000008) returned merged and
--     permanently closed restaurants, and took any radius and limit.
--   * attractions_within_radius (20260822000012) ignored is_active, the flag
--     admins use to hide an attraction, and took any radius and limit.
--
-- Every selected column is now cast to the declared RETURNS TABLE type. A
-- plpgsql RETURN QUERY fails with 42804 when a column's type differs from the
-- declared one, and the declared types (latitude REAL on events, double
-- precision on restaurants) do not match what 20260919000005 records for the
-- tables (double precision on events, real on restaurants). The casts make the
-- declared contract hold whichever way production has it.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md, "Backward Compatibility"). All additive:
--   * search_events_near_location gains an optional p_until and six appended
--     output columns. CREATE OR REPLACE with a new argument list would create
--     an OVERLOAD, and PostgREST answers the shipped four-argument named call
--     with PGRST203 (ambiguous), so the old signature is dropped and the new
--     one created in the same transaction (the 20261012000001 pattern). The
--     web, Android and shipped iOS send user_lat/user_lon/radius_meters/
--     search_limit by name, which resolves to the new function. Existing
--     output columns keep their names, types and order; new ones are appended.
--   * restaurants_within_radius and attractions_within_radius keep their exact
--     signatures and return shapes.
--   * restaurants_within_radius_v2 is a new function (full rows, so the map can
--     show photos, hours and Call). Nothing depends on it yet.
--   * The clamps (events: limit 1-200, radius 0-80467 m = 50 mi; restaurants
--     and attractions: limit 1-200, radius 0-50 mi) sit above every value a
--     shipped client sends: web NEARBY_EVENTS_LIMIT 200 and NEAR_ME_RADIUS
--     48280 m, iOS/Android 30 mi and 50/100 rows. A request over the cap is
--     answered with the cap, not an error.
--   * Filtering out merged/hidden/archived/closed rows narrows results, which
--     is the point; no client depends on seeing them (the table fallbacks on
--     every platform already exclude them).

BEGIN;

-- ---------------------------------------------------------------------------
-- Part A: events (IOS-DD-MAP-01)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.search_events_near_location(REAL, REAL, INTEGER, INTEGER);

CREATE FUNCTION public.search_events_near_location(
  user_lat REAL,
  user_lon REAL,
  radius_meters INTEGER DEFAULT 50000,
  search_limit INTEGER DEFAULT 50,
  p_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  date TIMESTAMPTZ,
  location TEXT,
  venue TEXT,
  city TEXT,
  category TEXT,
  price TEXT,
  image_url TEXT,
  latitude REAL,
  longitude REAL,
  enhanced_description TEXT,
  is_featured BOOLEAN,
  event_start_utc TIMESTAMPTZ,
  event_start_local TIMESTAMP,
  distance_meters INTEGER,
  end_date TIMESTAMPTZ,
  time_tbd BOOLEAN,
  source TEXT,
  source_url TEXT,
  is_sponsored BOOLEAN,
  sponsored_until TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(search_limit, 50), 1), 200);
  v_radius int := LEAST(GREATEST(COALESCE(radius_meters, 50000), 0), 80467);
  v_point geography;
  v_day_start timestamptz;
BEGIN
  IF user_lat IS NULL OR user_lon IS NULL OR abs(user_lat) > 90 OR abs(user_lon) > 180 THEN
    RETURN;
  END IF;

  v_point := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
  -- 00:00 today in Des Moines, not the UTC date.
  v_day_start := date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago';

  RETURN QUERY
  SELECT
    e.id::uuid,
    e.title::text,
    e.date::timestamptz,
    e.location::text,
    e.venue::text,
    e.city::text,
    e.category::text,
    e.price::text,
    e.image_url::text,
    e.latitude::real,
    e.longitude::real,
    e.enhanced_description::text,
    e.is_featured::boolean,
    e.event_start_utc::timestamptz,
    e.event_start_local::timestamp,
    CAST(ST_Distance(e.geom::geography, v_point) AS INTEGER),
    e.end_date::timestamptz,
    e.time_tbd::boolean,
    e.source::text,
    e.source_url::text,
    e.is_sponsored::boolean,
    e.sponsored_until::timestamptz
  FROM public.events e
  WHERE e.is_merged IS NOT TRUE
    AND e.is_hidden IS NOT TRUE
    AND e.archived_at IS NULL
    AND e.geom IS NOT NULL
    AND (e.date >= v_day_start OR e.end_date >= now())
    AND (p_until IS NULL OR e.date <= p_until)
    AND ST_DWithin(e.geom::geography, v_point, v_radius)
  -- Nearest first. is_featured stays an output column but no longer ranks:
  -- it means editorial or paid, and nothing here labels it.
  ORDER BY ST_Distance(e.geom::geography, v_point) ASC, e.date ASC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_events_near_location(REAL, REAL, INTEGER, INTEGER, TIMESTAMPTZ)
  TO anon, authenticated;

COMMENT ON FUNCTION public.search_events_near_location(REAL, REAL, INTEGER, INTEGER, TIMESTAMPTZ) IS
  'Visible upcoming events (not merged, hidden or archived; starting today in Central time or still running) within radius_meters (max 80467) of a point, nearest first, at most search_limit (1-200) rows. p_until caps the start date. IOS-DD-MAP-01.';

-- ---------------------------------------------------------------------------
-- Part B: restaurants (IOS-DD-MAP-02)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restaurants_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_miles double precision,
  limit_count integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  name text,
  cuisine text,
  location text,
  city text,
  rating numeric,
  latitude double precision,
  longitude double precision,
  distance_miles double precision
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(limit_count, 100), 1), 200);
  v_radius_miles double precision := LEAST(GREATEST(COALESCE(radius_miles, 25), 0), 50);
  v_point geography;
BEGIN
  IF center_lat IS NULL OR center_lng IS NULL THEN
    RETURN;
  END IF;
  v_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;

  RETURN QUERY
  SELECT
    r.id::uuid,
    r.name::text,
    r.cuisine::text,
    r.location::text,
    r.city::text,
    r.rating::numeric,
    r.latitude::double precision,
    r.longitude::double precision,
    (ST_Distance(r.geom::geography, v_point) / 1609.34)::double precision
  FROM public.restaurants r
  WHERE r.geom IS NOT NULL
    AND r.is_merged IS NOT TRUE
    AND coalesce(upper(r.business_status), '') <> 'CLOSED_PERMANENTLY'
    AND coalesce(lower(r.status), '') NOT IN ('closed', 'permanently_closed', 'closed_permanently')
    AND ST_DWithin(r.geom::geography, v_point, v_radius_miles * 1609.34)
  ORDER BY ST_Distance(r.geom::geography, v_point) ASC, r.popularity_score DESC NULLS LAST
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restaurants_within_radius(double precision, double precision, double precision, integer)
  TO anon, authenticated;

-- Full rows, so the map pin can show a photo, the hours and Call. SECURITY
-- INVOKER: the caller's RLS applies, as it does to .from('restaurants').
CREATE OR REPLACE FUNCTION public.restaurants_within_radius_v2(
  center_lat double precision,
  center_lng double precision,
  radius_miles double precision DEFAULT 25,
  limit_count integer DEFAULT 100
)
RETURNS SETOF public.restaurants
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
  WITH params AS (
    SELECT
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography AS pt,
      LEAST(GREATEST(COALESCE(radius_miles, 25), 0), 50) * 1609.34 AS meters
  )
  SELECT r.*
  FROM public.restaurants r, params p
  WHERE center_lat IS NOT NULL
    AND center_lng IS NOT NULL
    AND r.geom IS NOT NULL
    AND r.is_merged IS NOT TRUE
    AND coalesce(upper(r.business_status), '') <> 'CLOSED_PERMANENTLY'
    AND coalesce(lower(r.status), '') NOT IN ('closed', 'permanently_closed', 'closed_permanently')
    AND ST_DWithin(r.geom::geography, p.pt, p.meters)
  ORDER BY ST_Distance(r.geom::geography, p.pt) ASC, r.popularity_score DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(limit_count, 100), 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.restaurants_within_radius_v2(double precision, double precision, double precision, integer)
  TO anon, authenticated;

COMMENT ON FUNCTION public.restaurants_within_radius_v2(double precision, double precision, double precision, integer) IS
  'Full restaurant rows (not merged, not permanently closed) within radius_miles (max 50) of a point, nearest first, at most limit_count (1-200). IOS-DD-MAP-02.';

-- ---------------------------------------------------------------------------
-- Part C: attractions (IOS-DD-MAP-03)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attractions_within_radius(
  center_lat    double precision,
  center_lng    double precision,
  radius_miles  double precision DEFAULT 30,
  limit_count   integer DEFAULT 50
)
RETURNS SETOF public.attractions
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH params AS (
    SELECT
      LEAST(GREATEST(COALESCE(radius_miles, 30), 0), 50) AS r
  ),
  bounds AS (
    SELECT
      p.r / 69.0                                                  AS lat_delta,
      p.r / (69.0 * GREATEST(cos(radians(center_lat)), 0.01))     AS lng_delta
    FROM params p
  )
  SELECT a.*
  FROM public.attractions a, bounds b, params p
  WHERE a.is_active IS NOT FALSE
    AND a.latitude IS NOT NULL
    AND a.longitude IS NOT NULL
    AND a.latitude  BETWEEN center_lat - b.lat_delta AND center_lat + b.lat_delta
    AND a.longitude BETWEEN center_lng - b.lng_delta AND center_lng + b.lng_delta
    AND (
      3958.8 * acos(
        LEAST(1.0,
          cos(radians(center_lat)) * cos(radians(a.latitude::double precision))
          * cos(radians(a.longitude::double precision) - radians(center_lng))
          + sin(radians(center_lat)) * sin(radians(a.latitude::double precision))
        )
      )
    ) <= p.r
  ORDER BY (
    3958.8 * acos(
      LEAST(1.0,
        cos(radians(center_lat)) * cos(radians(a.latitude::double precision))
        * cos(radians(a.longitude::double precision) - radians(center_lng))
        + sin(radians(center_lat)) * sin(radians(a.latitude::double precision))
      )
    )
  ) ASC
  LIMIT LEAST(GREATEST(COALESCE(limit_count, 50), 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.attractions_within_radius(double precision, double precision, double precision, integer)
  TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
