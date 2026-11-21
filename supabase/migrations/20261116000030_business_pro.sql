-- Growth roadmap #3, part 2: Business Pro, $49/month per listing.
--
-- A verified owner (business_claims, 20260920000005) can pay for Pro on one
-- listing. Pro adds, on top of the free owner stats (20261102000004):
--   * up to 365 days of history instead of 90;
--   * the listing's rank in its peer group and the group's quartiles;
--   * a weekly emailed stats report (edge function, separate change).
--
-- WHERE THE PRICE LIVES (CLAUDE.md "Money is decided on the server").
-- business_plans holds the one plan: the displayed amount and the Stripe price
-- that is actually charged. create-business-pro-checkout reads the Stripe price
-- from this row; nothing in the browser computes or sends an amount. The page
-- reads price_monthly_cents only to print it. stripe_price_id_monthly ships
-- NULL: the owner creates the $49 price in Stripe and sets it, and until then
-- checkout refuses with "not configured" instead of charging anything.
--
-- WHY A SEPARATE TABLE FROM user_subscriptions. Reader plans are one per user
-- and ranked by sort_order; create-subscription-checkout treats any change as
-- an upgrade or downgrade of that one subscription. An owner's Pro is per
-- listing and sits beside whatever reader plan they have, so it gets its own
-- rows, written only by stripe-webhook with the service role.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md). Additive: two new tables, two new
-- functions, and CREATE OR REPLACE of get_listing_owner_stats with the same
-- signature. Its jsonb gains `pro`, and `peers` gains rank/of/p25_views/
-- p75_views for Pro; readers ignore unknown keys. A non-Pro caller gets exactly
-- what 20261102000004 returned, including the 90-day cap.

CREATE TABLE IF NOT EXISTS public.business_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  price_monthly_cents integer NOT NULL CHECK (price_monthly_cents > 0),
  stripe_price_id_monthly text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.business_plans.stripe_price_id_monthly IS
  'The Stripe price checkout charges. NULL = not configured; checkout refuses. Must be a $49.00/month recurring price to match price_monthly_cents.';

INSERT INTO public.business_plans (slug, display_name, price_monthly_cents)
VALUES ('business_pro', 'Business Pro', 4900)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.business_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active business plans" ON public.business_plans;
CREATE POLICY "Anyone can read active business plans"
  ON public.business_plans FOR SELECT
  TO anon, authenticated
  USING (is_active);

CREATE TABLE IF NOT EXISTS public.business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_type text NOT NULL CHECK (listing_type IN ('restaurant', 'attraction')),
  listing_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.business_plans(id),
  stripe_customer_id text,
  stripe_subscription_id text NOT NULL UNIQUE,
  status text NOT NULL,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_subscriptions_listing_idx
  ON public.business_subscriptions (listing_type, listing_id);
CREATE INDEX IF NOT EXISTS business_subscriptions_user_idx
  ON public.business_subscriptions (user_id);

ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners read their own rows. There is no INSERT, UPDATE or DELETE policy on
-- purpose: only stripe-webhook (service role) writes, from Stripe's own events.
DROP POLICY IF EXISTS "Owners read their business subscriptions" ON public.business_subscriptions;
CREATE POLICY "Owners read their business subscriptions"
  ON public.business_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Explicit privileges rather than relying on the platform's default grants
-- (this Supabase is self-hosted). Reads go through the RLS policies above;
-- writes to business_subscriptions are revoked outright, so a client can never
-- give itself Pro even if a write policy were added by mistake later.
GRANT SELECT ON public.business_plans TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.business_plans FROM anon, authenticated;
GRANT SELECT ON public.business_subscriptions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.business_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.business_subscriptions FROM anon;

/**
 * Is Pro live for this user on this listing? Internal: called by the stats
 * function and has_business_pro, never granted to clients directly.
 *
 * Live means the payer still holds the verified claim (a transferred listing
 * does not carry someone else's subscription) and Stripe last reported the
 * subscription active or trialing, or past_due while the paid period has not
 * ended yet: a failed card gets the rest of the month it paid for, not an
 * instant lockout.
 */
CREATE OR REPLACE FUNCTION public.business_pro_active(
  p_user uuid,
  p_listing_type text,
  p_listing_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_user IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.business_claims c
       WHERE c.user_id = p_user
         AND c.listing_type = p_listing_type
         AND c.listing_id = p_listing_id
         AND c.status = 'verified')
     AND EXISTS (
       SELECT 1 FROM public.business_subscriptions s
       WHERE s.user_id = p_user
         AND s.listing_type = p_listing_type
         AND s.listing_id = p_listing_id
         AND (s.status IN ('active', 'trialing')
              OR (s.status = 'past_due' AND s.current_period_end > now())));
$$;

REVOKE ALL ON FUNCTION public.business_pro_active(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

/** The caller's Pro status on one listing, for the dashboard. */
CREATE OR REPLACE FUNCTION public.has_business_pro(p_listing_type text, p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.business_pro_active(auth.uid(), p_listing_type, p_listing_id);
$$;

REVOKE ALL ON FUNCTION public.has_business_pro(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_business_pro(text, uuid) TO authenticated;

-- get_listing_owner_stats, as in 20261102000004 plus the Pro additions above.
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
  v_days     integer;
  v_pro      boolean := false;
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
  v_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM public.user_roles r
           WHERE r.user_id = v_user
             AND r.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role]))
    INTO v_is_admin;

  SELECT v_is_admin OR EXISTS (
           SELECT 1 FROM public.business_claims c
           WHERE c.user_id = v_user
             AND c.listing_type = p_listing_type
             AND c.listing_id = p_listing_id
             AND c.status = 'verified')
    INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not_listing_owner' USING ERRCODE = '42501';
  END IF;

  -- Business Pro reaches back a year; everyone else keeps the 90-day cap the
  -- function shipped with (20261102000004). Admins see the Pro view so support
  -- can look at what an owner sees.
  v_pro := v_is_admin OR public.business_pro_active(v_user, p_listing_type, p_listing_id);
  v_days := LEAST(GREATEST(COALESCE(p_days, 30), 7), CASE WHEN v_pro THEN 365 ELSE 90 END);

  IF p_listing_type NOT IN ('restaurant', 'attraction') THEN
    RETURN jsonb_build_object('status', 'no_data', 'days', v_days, 'pro', v_pro);
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
           -- Pro adds where the listing sits and the spread around it. Still
           -- aggregates only: a rank and two quartiles name no other business
           -- and give no other business's figure.
           || CASE WHEN v_pro THEN jsonb_build_object(
                'rank', count(*) FILTER (WHERE views > v_mine) + 1,
                'of', count(*) + 1,
                'p25_views', percentile_disc(0.25) WITHIN GROUP (ORDER BY views),
                'p75_views', percentile_disc(0.75) WITHIN GROUP (ORDER BY views))
              ELSE '{}'::jsonb END
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
    'peers', v_peers,
    'pro', v_pro
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_listing_owner_stats(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_owner_stats(text, uuid, integer) TO authenticated;
