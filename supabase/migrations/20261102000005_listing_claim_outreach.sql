-- Growth roadmap #2: claim pages an owner can be sent to, and the list of who
-- to send.
--
--   get_listing_claim_teaser(type, id)      anon. For the public page
--     /business/claim/<type>/<id>: the listing's name, whether someone already
--     holds it, and, ONLY while nobody does, a coarse 30-day view count.
--   list_unclaimed_listings_by_views(...)   admin. Unclaimed, open listings
--     ranked by recent page views, with the website and phone already on the
--     public listing, so outreach starts with the places people look at most.
--
-- WHAT THE TEASER EXPOSES, AND WHY IT IS COARSE. Anyone can call it, so it
-- returns views floored to the nearest ten and nothing under ten ("40+ people
-- looked at this page"), never the daily series or the comparison that
-- get_listing_owner_stats (20261102000004) gives a verified owner. Once a
-- listing has a verified owner the count is withheld: their numbers are theirs.
--
-- Same source and same caveat as the owner stats: content_metrics 'view' rows,
-- counted only for visitors who allowed analytics cookies.
--
-- Nothing here sends anything. Outreach is a person using the admin list.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md): two new functions. Nothing existing
-- changes.

CREATE OR REPLACE FUNCTION public.get_listing_claim_teaser(
  p_listing_type text,
  p_listing_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today   date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_name    text;
  v_closed  boolean := false;
  v_claimed boolean;
  v_views   bigint;
BEGIN
  IF p_listing_type = 'restaurant' THEN
    SELECT r.name,
           COALESCE(lower(trim(r.status)), '') IN ('closed', 'permanently_closed', 'closed_permanently')
             OR COALESCE(upper(trim(r.business_status)), '') = 'CLOSED_PERMANENTLY'
      INTO v_name, v_closed
    FROM public.restaurants r WHERE r.id = p_listing_id;
  ELSIF p_listing_type = 'attraction' THEN
    SELECT a.name, a.is_active IS NOT DISTINCT FROM false
      INTO v_name, v_closed
    FROM public.attractions a WHERE a.id = p_listing_id;
  ELSE
    RETURN NULL;
  END IF;

  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.business_claims c
    WHERE c.listing_type = p_listing_type
      AND c.listing_id = p_listing_id
      AND c.status = 'verified'
  ) INTO v_claimed;

  IF NOT v_claimed AND NOT v_closed THEN
    SELECT COALESCE(SUM(cm.metric_value), 0) INTO v_views
    FROM public.content_metrics cm
    WHERE cm.content_type = p_listing_type
      AND cm.content_id = p_listing_id
      AND cm.metric_type = 'view'
      AND cm.date BETWEEN v_today - 29 AND v_today;
  END IF;

  RETURN jsonb_build_object(
    'name', v_name,
    'claimed', v_claimed,
    'closed', v_closed,
    'views_30d_floor', CASE WHEN v_views >= 10 THEN (v_views / 10) * 10 ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_listing_claim_teaser(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listing_claim_teaser(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_unclaimed_listings_by_views(
  p_listing_type text    DEFAULT 'restaurant',
  p_days         integer DEFAULT 30,
  p_limit        integer DEFAULT 50
)
RETURNS TABLE (
  listing_id uuid,
  name       text,
  slug       text,
  website    text,
  phone      text,
  views      bigint,
  pending_claims integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days  integer := LEAST(GREATEST(COALESCE(p_days, 30), 7), 90);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid()
      AND r.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
  ) THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  IF p_listing_type = 'restaurant' THEN
    RETURN QUERY
    WITH v AS (
      SELECT cm.content_id, SUM(cm.metric_value)::bigint AS views
      FROM public.content_metrics cm
      WHERE cm.content_type = 'restaurant'
        AND cm.metric_type = 'view'
        AND cm.date BETWEEN v_today - (v_days - 1) AND v_today
      GROUP BY cm.content_id
    )
    SELECT r.id, r.name, r.slug, r.website, r.phone, COALESCE(v.views, 0),
           (SELECT count(*)::integer FROM public.business_claims c
            WHERE c.listing_type = 'restaurant' AND c.listing_id = r.id AND c.status = 'pending')
    FROM public.restaurants r
    LEFT JOIN v ON v.content_id = r.id
    WHERE NOT EXISTS (
            SELECT 1 FROM public.business_claims c
            WHERE c.listing_type = 'restaurant' AND c.listing_id = r.id AND c.status = 'verified')
      AND COALESCE(lower(trim(r.status)), '') NOT IN ('closed', 'permanently_closed', 'closed_permanently')
      AND COALESCE(upper(trim(r.business_status)), '') <> 'CLOSED_PERMANENTLY'
    ORDER BY COALESCE(v.views, 0) DESC, r.name
    LIMIT v_limit;
  ELSIF p_listing_type = 'attraction' THEN
    RETURN QUERY
    WITH v AS (
      SELECT cm.content_id, SUM(cm.metric_value)::bigint AS views
      FROM public.content_metrics cm
      WHERE cm.content_type = 'attraction'
        AND cm.metric_type = 'view'
        AND cm.date BETWEEN v_today - (v_days - 1) AND v_today
      GROUP BY cm.content_id
    )
    SELECT a.id, a.name, NULL::text, a.website, NULL::text, COALESCE(v.views, 0),
           (SELECT count(*)::integer FROM public.business_claims c
            WHERE c.listing_type = 'attraction' AND c.listing_id = a.id AND c.status = 'pending')
    FROM public.attractions a
    LEFT JOIN v ON v.content_id = a.id
    WHERE NOT EXISTS (
            SELECT 1 FROM public.business_claims c
            WHERE c.listing_type = 'attraction' AND c.listing_id = a.id AND c.status = 'verified')
      AND a.is_active IS DISTINCT FROM false
    ORDER BY COALESCE(v.views, 0) DESC, a.name
    LIMIT v_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_unclaimed_listings_by_views(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_unclaimed_listings_by_views(text, integer, integer) TO authenticated;
