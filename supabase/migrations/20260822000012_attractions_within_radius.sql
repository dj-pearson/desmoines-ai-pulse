-- IOS-AUDIT-PERF-027 AC2: attractions had no radius RPC, so the iOS nearby path
-- was table-fallback only.
--
-- WHY IT RETURNS SETOF attractions RATHER THAN A PROJECTION. The existing
-- restaurants_within_radius and events_within_radius return a narrow TABLE(...)
-- of hand-picked columns. That shape cannot decode into the iOS `Attraction`
-- model, which expects a full row, so a projection here would need a second
-- Swift type and a second decode path that drifts from the first. SETOF gives
-- the client exactly what .from("attractions").select() gives it.
--
-- The cost is that distance cannot be returned as a column. It is not needed:
-- the rows come back already ordered nearest-first, and no iOS surface displays
-- a distance for an attraction.
--
-- NO PostGIS HERE, deliberately. attractions has no `geom` column -- only
-- latitude/longitude as float4 -- unlike restaurants. Building a geography per
-- row to use ST_DWithin would prevent any index from being used anyway, so this
-- filters on a lat/lng bounding box first (sargable) and then applies the exact
-- great-circle distance to the survivors. With 22 attractions, 17 of them
-- geocoded, either approach is instant; the bounding box is what keeps it that
-- way if the table grows.
CREATE OR REPLACE FUNCTION public.attractions_within_radius(
  center_lat    double precision,
  center_lng    double precision,
  radius_miles  double precision DEFAULT 30,
  limit_count   integer DEFAULT 50
)
RETURNS SETOF public.attractions
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT
      -- ~69 miles per degree of latitude. Longitude degrees shrink with
      -- latitude, hence the cosine. Clamped so a latitude near the poles cannot
      -- divide by ~0 and produce an infinite box.
      radius_miles / 69.0                                                  AS lat_delta,
      radius_miles / (69.0 * GREATEST(cos(radians(center_lat)), 0.01))     AS lng_delta
  )
  SELECT a.*
  FROM public.attractions a, bounds b
  WHERE a.latitude IS NOT NULL
    AND a.longitude IS NOT NULL
    -- Bounding box first: cheap, and it is what an index on (latitude,
    -- longitude) can use.
    AND a.latitude  BETWEEN center_lat - b.lat_delta AND center_lat + b.lat_delta
    AND a.longitude BETWEEN center_lng - b.lng_delta AND center_lng + b.lng_delta
    -- Then the exact circle, so the corners of the box are not returned.
    AND (
      3958.8 * acos(
        LEAST(1.0,
          cos(radians(center_lat)) * cos(radians(a.latitude::double precision))
          * cos(radians(a.longitude::double precision) - radians(center_lng))
          + sin(radians(center_lat)) * sin(radians(a.latitude::double precision))
        )
      )
    ) <= radius_miles
  ORDER BY (
    3958.8 * acos(
      LEAST(1.0,
        cos(radians(center_lat)) * cos(radians(a.latitude::double precision))
        * cos(radians(a.longitude::double precision) - radians(center_lng))
        + sin(radians(center_lat)) * sin(radians(a.latitude::double precision))
      )
    )
  ) ASC
  LIMIT limit_count;
$$;

-- Attractions are public content; the same anon read the table already allows.
GRANT EXECUTE ON FUNCTION public.attractions_within_radius(double precision, double precision, double precision, integer)
  TO anon, authenticated;
