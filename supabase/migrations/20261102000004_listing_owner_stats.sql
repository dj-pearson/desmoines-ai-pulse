-- Growth roadmap #3: an owner dashboard worth checking every day.
--
-- get_listing_owner_stats(type, id, days) gives the VERIFIED owner of a
-- restaurant or attraction (business_claims, 20260920000005) their own
-- listing's numbers, and an anonymous comparison against similar places.
--
-- WHERE THE NUMBERS COME FROM. content_metrics, written by log-content-metrics
-- from useContentTracking on the restaurant and attraction detail pages:
-- 'view' once per page load, 'share' from the share button, 'click' from the
-- contact/actions block. Only visitors who accepted analytics cookies are
-- counted, so every figure is a floor, and the dashboard says so. Nothing is
-- estimated or filled in.
--
-- WHY A FUNCTION. content_metrics is readable only by admins
-- (20260822000006, AC6), and it should stay that way: one owner must never see
-- another business's figures. This function is the whole grant. It returns:
--   * the caller's own listing, per day and in total, this period and the one
--     before it;
--   * for the peer group, ONLY its size, its median and the caller's
--     percentile. No other listing's id, name or count leaves the function.
-- A peer group under PEER_MIN listings returns no comparison at all, because a
-- median of three restaurants would point at the other two.
--
-- 'venue' claims exist but nothing records venue page views, so venues get
-- no_data rather than a row of zeros that would read as "nobody looked".
--
-- BACKWARD COMPATIBILITY (CLAUDE.md): a new function and one index. Nothing
-- existing changes.

-- The function reads by (content_type, content_id, date); the existing
-- (content_id, metric_type) index does not cover the date range.
CREATE INDEX IF NOT EXISTS idx_content_metrics_type_date_content
  ON public.content_metrics (content_type, date, content_id);

CREATE OR REPLACE FUNCTION public.get_listing_owner_stats(
  p_listing_type text,
  p_listing_id   uuid,
  p_days         integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  PEER_MIN   CONSTANT integer := 5;
  v_user     uuid := auth.uid();
  v_days     integer := LEAST(GREATEST(COALESCE(p_days, 30), 7), 90);
  v_today    date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_from     date;
  v_prev     date;
  v_allowed  boolean;
  v_days_json jsonb;
  v_totals   jsonb;
  v_previous jsonb;
  v_peers    jsonb := NULL;
  v_group    text;
  v_label    text;
  v_cuisine  text;
  v_hood     text;
  v_kind     text;
  v_ids      uuid[];
  v_mine     bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM public.business_claims c
           WHERE c.user_id = v_user
             AND c.listing_type = p_listing_type
             AND c.listing_id = p_listing_id
             AND c.status = 'verified')
      OR EXISTS (
           SELECT 1 FROM public.user_roles r
           WHERE r.user_id = v_user
             AND r.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role]))
    INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not_listing_owner' USING ERRCODE = '42501';
  END IF;

  IF p_listing_type NOT IN ('restaurant', 'attraction') THEN
    RETURN jsonb_build_object('status', 'no_data', 'days', v_days);
  END IF;

  -- Inclusive window of v_days Central dates ending today, and the same length
  -- immediately before it.
  v_from := v_today - (v_days - 1);
  v_prev := v_from - v_days;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'date', d::date,
           'views',  COALESCE(m.views, 0),
           'shares', COALESCE(m.shares, 0),
           'clicks', COALESCE(m.clicks, 0)) ORDER BY d), '[]'::jsonb)
    INTO v_days_json
  FROM generate_series(v_from, v_today, interval '1 day') AS d
  LEFT JOIN (
    SELECT cm.date,
           SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'view')  AS views,
           SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'share') AS shares,
           SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'click') AS clicks
    FROM public.content_metrics cm
    WHERE cm.content_type = p_listing_type
      AND cm.content_id = p_listing_id
      AND cm.date BETWEEN v_from AND v_today
    GROUP BY cm.date
  ) m ON m.date = d::date;

  SELECT jsonb_build_object(
           'views',  COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'view'), 0),
           'shares', COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'share'), 0),
           'clicks', COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'click'), 0))
    INTO v_totals
  FROM public.content_metrics cm
  WHERE cm.content_type = p_listing_type
    AND cm.content_id = p_listing_id
    AND cm.date BETWEEN v_from AND v_today;

  SELECT jsonb_build_object(
           'views',  COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'view'), 0),
           'shares', COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'share'), 0),
           'clicks', COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'click'), 0))
    INTO v_previous
  FROM public.content_metrics cm
  WHERE cm.content_type = p_listing_type
    AND cm.content_id = p_listing_id
    AND cm.date BETWEEN v_prev AND v_from - 1;

  -- Peer group: the narrowest group with at least PEER_MIN open listings.
  -- Restaurants: same cuisine, then same neighbourhood, then all restaurants.
  -- Attractions: same type, then all attractions.
  IF p_listing_type = 'restaurant' THEN
    SELECT lower(trim(r.cuisine)), r.neighborhood INTO v_cuisine, v_hood
    FROM public.restaurants r WHERE r.id = p_listing_id;

    -- Open restaurants only: the same three statuses and Google flag as
    -- isPermanentlyClosedRestaurant (src/lib/restaurantHours.ts).
    WITH open_r AS (
      SELECT r.id, lower(trim(r.cuisine)) AS cuisine, r.neighborhood
      FROM public.restaurants r
      WHERE r.id <> p_listing_id
        AND COALESCE(lower(trim(r.status)), '') NOT IN ('closed', 'permanently_closed', 'closed_permanently')
        AND COALESCE(upper(trim(r.business_status)), '') <> 'CLOSED_PERMANENTLY'
    ),
    by_cuisine AS (
      SELECT array_agg(id) AS ids FROM open_r
      WHERE v_cuisine IS NOT NULL AND v_cuisine <> '' AND cuisine = v_cuisine
    ),
    by_hood AS (
      SELECT array_agg(id) AS ids FROM open_r
      WHERE v_hood IS NOT NULL AND neighborhood = v_hood
    ),
    everyone AS (SELECT array_agg(id) AS ids FROM open_r)
    SELECT
      CASE
        WHEN COALESCE(array_length(c.ids, 1), 0) >= PEER_MIN THEN c.ids
        WHEN COALESCE(array_length(h.ids, 1), 0) >= PEER_MIN THEN h.ids
        ELSE e.ids
      END,
      CASE
        WHEN COALESCE(array_length(c.ids, 1), 0) >= PEER_MIN THEN 'cuisine'
        WHEN COALESCE(array_length(h.ids, 1), 0) >= PEER_MIN THEN 'neighborhood'
        ELSE 'all'
      END
      INTO v_ids, v_group
    FROM by_cuisine c, by_hood h, everyone e;

    IF v_group = 'cuisine' THEN
      SELECT trim(r.cuisine) INTO v_label FROM public.restaurants r WHERE r.id = p_listing_id;
    ELSIF v_group = 'neighborhood' THEN
      v_label := v_hood;
    ELSE
      v_label := 'restaurants';
    END IF;
  ELSE
    SELECT a.type INTO v_kind FROM public.attractions a WHERE a.id = p_listing_id;
    IF v_kind IS NOT NULL
       AND (SELECT count(*) FROM public.attractions a
            WHERE a.type = v_kind AND a.id <> p_listing_id AND a.is_active IS DISTINCT FROM false) >= PEER_MIN THEN
      SELECT array_agg(a.id) INTO v_ids FROM public.attractions a
      WHERE a.type = v_kind AND a.id <> p_listing_id AND a.is_active IS DISTINCT FROM false;
      v_group := 'type';
      v_label := v_kind;
    ELSE
      SELECT array_agg(a.id) INTO v_ids FROM public.attractions a
      WHERE a.id <> p_listing_id AND a.is_active IS DISTINCT FROM false;
      v_group := 'all';
      v_label := 'attractions';
    END IF;
  END IF;

  IF COALESCE(array_length(v_ids, 1), 0) >= PEER_MIN THEN
    v_mine := (v_totals ->> 'views')::bigint;
    -- Every peer counts, including the ones nobody viewed: most listings get
    -- few views, and leaving the zeros out would make every owner look
    -- below average.
    WITH peer_views AS (
      SELECT p.id, COALESCE(SUM(cm.metric_value), 0) AS views
      FROM unnest(v_ids) AS p(id)
      LEFT JOIN public.content_metrics cm
        ON cm.content_type = p_listing_type
       AND cm.content_id = p.id
       AND cm.metric_type = 'view'
       AND cm.date BETWEEN v_from AND v_today
      GROUP BY p.id
    )
    SELECT jsonb_build_object(
             'group', v_group,
             'label', v_label,
             'size', count(*),
             'median_views', percentile_disc(0.5) WITHIN GROUP (ORDER BY views),
             -- Share of peers with FEWER views than this listing, 0-100.
             'percentile', round(100.0 * count(*) FILTER (WHERE views < v_mine) / count(*)))
      INTO v_peers
    FROM peer_views;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'days', v_days,
    'from', v_from,
    'to', v_today,
    'series', v_days_json,
    'totals', v_totals,
    'previous', v_previous,
    'peers', v_peers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_listing_owner_stats(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_owner_stats(text, uuid, integer) TO authenticated;
